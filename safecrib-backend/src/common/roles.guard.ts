import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator.js';
import { PUBLIC_KEY } from './public.decorator.js';
import type { Role } from './roles.decorator.js';
import type { Request } from 'express';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { STUDENT_PROFILE_APPROVED_KEY } from './student-profile.decorator.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
    emailVerified: boolean;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Requires one of: ${requiredRoles.join(', ')}`,
      );
    }

    const requiresApprovedStudent = this.reflector.getAllAndOverride<boolean>(
      STUDENT_PROFILE_APPROVED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiresApprovedStudent && user.role === 'STUDENT') {
      const profile = await this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
        select: { status: true },
      });
      if (!profile || profile.status !== 'APPROVED') {
        throw new ForbiddenException(
          'Your student profile must be approved before you can perform this action',
        );
      }
    }

    return true;
  }
}