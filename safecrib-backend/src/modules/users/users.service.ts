import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { UpdateUserDto } from './dto/user.dto.js';
import type { ChangePasswordDto } from './dto/user.dto.js';
import type { Role } from '../../common/roles.decorator.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerified: true,
        identityVerified: true,
        trustScore: true,
        trustScoreUpdatedAt: true,
        createdAt: true,
        studentProfile: {
          select: {
            id: true,
            email: true,
            displayName: true,
            proofOfStudentship: true,
            schoolOfStudy: true,
            courseOfStudy: true,
            level: true,
            profilePicture: true,
            dateOfBirth: true,
            gender: true,
            phoneNumber: true,
            emergencyContact: true,
            socialLinks: true,
            status: true,
            reviewNotes: true,
            rejectionReason: true,
            submittedAt: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { studentProfile, ...rest } = user;
    return {
      ...rest,
      studentProfileStatus: studentProfile?.status ?? 'NOT_SUBMITTED',
    };
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.role && dto.role !== user.role && user.role !== 'ADMIN') {
      throw new BadRequestException('Cannot change own role');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName ?? undefined,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerified: true,
        identityVerified: true,
        trustScore: true,
        createdAt: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 8192,
      parallelism: 2,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password changed successfully' };
  }

  async setUserRole(userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });
  }
}
