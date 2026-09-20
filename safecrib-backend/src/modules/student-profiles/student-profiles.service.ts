import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  ProfileStatus,
  StudentProfileSubmission,
  SubmissionRecord,
} from '../../common/types.js';
import type { StudentSignupDto } from './dto/student-signup.dto.js';
import type { CompleteStudentProfileDto } from './dto/student-signup.dto.js';

type StudentProfileStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

@Injectable()
export class StudentProfileService {
  private readonly logger = new Logger(StudentProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitSignup(_dto: StudentSignupDto): Promise<SubmissionRecord> {
    throw new BadRequestException(
      'Direct signup submission is no longer supported. Create an account first, then complete your student profile.',
    );
  }

  async completeProfile(userId: string, dto: CompleteStudentProfileDto): Promise<SubmissionRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('Only student accounts can complete a student profile');
    }

    const existing = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });

    if (existing?.status === 'PENDING') {
      throw new ConflictException('Your student profile is already pending review');
    }
    if (existing?.status === 'APPROVED') {
      throw new ConflictException('Your student profile has already been approved');
    }

    const submittedData: StudentProfileSubmission = {
      displayName: dto.displayName?.trim() || null,
      proofOfStudentship: dto.proofOfStudentship.trim(),
      schoolOfStudy: dto.schoolOfStudy.trim(),
      courseOfStudy: dto.courseOfStudy.trim(),
      level: dto.level.trim(),
      profilePicture: dto.profilePicture.trim(),
      dateOfBirth: dto.dateOfBirth ?? null,
      gender: dto.gender?.trim() || null,
      phoneNumber: dto.phoneNumber?.trim() || null,
      emergencyContact: dto.emergencyContact?.trim() || null,
      socialLinks: dto.socialLinks ?? null,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const profile = existing
        ? await tx.studentProfile.update({
            where: { id: existing.id },
            data: {
              displayName: submittedData.displayName,
              proofOfStudentship: submittedData.proofOfStudentship,
              schoolOfStudy: submittedData.schoolOfStudy,
              courseOfStudy: submittedData.courseOfStudy,
              level: submittedData.level,
              profilePicture: submittedData.profilePicture,
              dateOfBirth: submittedData.dateOfBirth
                ? new Date(submittedData.dateOfBirth)
                : null,
              gender: submittedData.gender,
              phoneNumber: submittedData.phoneNumber,
              emergencyContact: submittedData.emergencyContact,
              socialLinks: submittedData.socialLinks as any,
              status: 'PENDING',
              reviewedBy: null,
              reviewNotes: null,
              rejectionReason: null,
              submittedAt: new Date(),
              reviewedAt: null,
            },
          })
        : await tx.studentProfile.create({
            data: {
              userId,
              email: user.email,
              passwordHash: user.passwordHash,
              displayName: submittedData.displayName,
              proofOfStudentship: submittedData.proofOfStudentship,
              schoolOfStudy: submittedData.schoolOfStudy,
              courseOfStudy: submittedData.courseOfStudy,
              level: submittedData.level,
              profilePicture: submittedData.profilePicture,
              dateOfBirth: submittedData.dateOfBirth
                ? new Date(submittedData.dateOfBirth)
                : null,
              gender: submittedData.gender,
              phoneNumber: submittedData.phoneNumber,
              emergencyContact: submittedData.emergencyContact,
              socialLinks: submittedData.socialLinks as any,
              status: 'PENDING',
              submittedAt: new Date(),
            },
          });

      const queue = await tx.adminReviewQueue.create({
        data: {
          email: user.email,
          tier: 'STUDENT',
          reviewType: 'SIGNUP',
          status: 'PENDING',
          entityType: 'student_profile',
          entityId: profile.id,
          submittedData: submittedData as any,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'STUDENT_PROFILE_SUBMITTED',
          entityType: 'student_profile',
          entityId: profile.id,
          metadata: { reviewQueueId: queue.id },
        },
      });

      return { profile, queue };
    });

    this.logger.log(`Student profile submitted for ${user.email}`);
    return this.toRecord(result.profile, result.queue);
  }

  async getMyProfile(userId: string): Promise<SubmissionRecord | null> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) return null;

    const queue = await this.prisma.adminReviewQueue.findFirst({
      where: {
        entityType: 'student_profile',
        entityId: profile.id,
        tier: 'STUDENT',
        reviewType: 'SIGNUP',
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.toRecord(profile, queue ?? undefined);
  }

  async getProfileStatus(userId: string): Promise<{ status: StudentProfileStatus; profile: any | null }> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      return { status: 'NOT_SUBMITTED', profile: null };
    }
    return { status: profile.status as StudentProfileStatus, profile };
  }

  async requireApprovedStudent(userId: string): Promise<void> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (!profile || profile.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Your student profile must be approved before you can perform this action',
      );
    }
  }

  async getSubmission(submissionId: string): Promise<SubmissionRecord> {
    const queue = await this.prisma.adminReviewQueue.findUnique({
      where: { id: submissionId },
    });

    if (!queue) {
      throw new NotFoundException('Submission not found');
    }

    return this.toQueueRecord(queue);
  }

  async getSubmissionForEmail(submissionId: string, email: string): Promise<SubmissionRecord> {
    const queue = await this.prisma.adminReviewQueue.findUnique({
      where: { id: submissionId },
    });

    if (!queue) {
      throw new NotFoundException('Submission not found');
    }

    if (queue.email !== email.toLowerCase().trim()) {
      throw new ForbiddenException('You can only view your own submissions');
    }

    return this.toQueueRecord(queue);
  }

  async getSubmissionByEmail(email: string): Promise<SubmissionRecord | null> {
    const queue = await this.prisma.adminReviewQueue.findFirst({
      where: { email: email.toLowerCase().trim(), tier: 'STUDENT', reviewType: 'SIGNUP' },
      orderBy: { createdAt: 'desc' },
    });

    if (!queue) return null;
    return this.toQueueRecord(queue);
  }

  async listSubmissions(status?: ProfileStatus, tier?: 'STUDENT'): Promise<SubmissionRecord[]> {
    const where: any = {};
    if (status) where.status = status;
    if (tier) where.tier = tier;

    const queues = await this.prisma.adminReviewQueue.findMany({
      where,
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    });

    return queues.map((queue) => this.toQueueRecord(queue));
  }

  private toRecord(profile: any, queue: any): SubmissionRecord {
    return this.toQueueRecord(queue, profile);
  }

  private toQueueRecord(queue: any, profile?: any): SubmissionRecord {
    return {
      id: queue.id,
      email: queue.email,
      tier: queue.tier,
      reviewType: queue.reviewType,
      status: queue.status,
      entityType: 'student_profile',
      entityId: queue.entityId ?? profile?.id,
      submittedData: queue.submittedData,
      reviewNotes: queue.reviewNotes ?? null,
      reviewedBy: queue.reviewedBy ?? null,
      reviewedAt: queue.reviewedAt?.toISOString() ?? null,
      rejectionReason: queue.rejectionReason ?? null,
      submittedAt: (queue.createdAt ?? profile?.submittedAt ?? new Date()).toISOString(),
      createdAt: queue.createdAt.toISOString(),
    };
  }
}