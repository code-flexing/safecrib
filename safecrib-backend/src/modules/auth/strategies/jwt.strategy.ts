import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '../../../common/roles.decorator.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
  profilePicture: string | null;
  verification: {
    stage: string;
    badge: string;
    badgeColor: 'green' | 'blue' | 'gold';
    riskBlocked: boolean;
    eligible: boolean;
  } | null;
  emailVerified: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService, private readonly prisma: PrismaService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not set in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        profilePicture: true,
        emailVerified: true,
        verification: {
          select: {
            stage: true,
            badge: true,
            badgeColor: true,
            riskBlocked: true,
          },
        },
      },
    });
    if (!user || !user.emailVerified) return null as never;
    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      displayName: user.displayName ?? null,
      profilePicture: user.profilePicture ?? null,
      verification: user.verification
        ? {
            stage: user.verification.stage,
            badge: user.verification.badge,
            badgeColor: user.verification.badgeColor,
            riskBlocked: user.verification.riskBlocked,
            eligible: Boolean(user.verification.badge || user.verification.stage),
          }
        : null,
      emailVerified: user.emailVerified,
    };
  }
}
