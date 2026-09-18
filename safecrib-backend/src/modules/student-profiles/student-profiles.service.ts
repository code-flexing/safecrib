import {
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

@Injectable()
export class StudentProfileService {
  private readonly logger = new Logger(StudentProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitSignup(dto: StudentSignupDto): Promise<SubmissionRecord> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.studentProfile.findUnique({
      where: { email },
    });

    if (existing?.status === 'PENDING') {
      throw new ConflictException('A pending signup already exists for this email');
    }

    if (existing?.status === 'APPROVED') {
      throw new ConflictException('This email has already been approved');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 8192,
      parallelism: 2,
    });

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
            where: { email },
            data: {
              passwordHash,
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
              email,
              passwordHash,
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
          email,
          tier: 'STUDENT',
          reviewType: 'SIGNUP',
          status: 'PENDING',
          entityType: 'student_profile',
          entityId: profile.id,
          submittedData: submittedData as any,
        },
      });

      return { profile, queue };
    });

    this.logger.log(`Student signup submitted for ${email}`);
    return this.toRecord(result.profile, result.queue);
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
