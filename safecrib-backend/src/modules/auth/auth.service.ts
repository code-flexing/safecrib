import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import type { Role } from '../../common/roles.decorator.js';
import type { RegisterDto } from './dto/auth.dto.js';
import type { LoginDto } from './dto/auth.dto.js';
import type { JwtPayload } from './strategies/jwt.strategy.js';

const PASSWORD_RESET_EXPIRY_HOURS = 1;

function ttlToMs(ttl: string | number | undefined): number {
  if (ttl === undefined) {
    throw new Error('TTL value is required');
  }
  if (typeof ttl === 'number') {
    return ttl * 1000;
  }
  const match = /^(\d+)\s*([smhd])$/i.exec(String(ttl).trim());
  if (!match) {
    throw new Error(`Invalid TTL "${ttl}", expected e.g. "15m" or "14d"`);
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const secondsByUnit: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * secondsByUnit[unit] * 1000;
}
const EMAIL_JOB_ATTEMPTS = 5;
const EMAIL_JOB_BACKOFF_DELAY = 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTokenTtl: NonNullable<JwtSignOptions['expiresIn']>;
  private readonly refreshTokenTtl: NonNullable<JwtSignOptions['expiresIn']>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {
    const accessTtl = this.configService.get<string>('ACCESS_TOKEN_TTL') ?? '14d';
    const refreshTtl = this.configService.get<string>('REFRESH_TOKEN_TTL') ?? '14d';
    const accessMs = ttlToMs(accessTtl);
    const refreshMs = ttlToMs(refreshTtl);
    if (refreshMs < accessMs) {
      throw new Error(
        `REFRESH_TOKEN_TTL (${refreshTtl}) must be >= ACCESS_TOKEN_TTL (${accessTtl})`,
      );
    }
    this.accessTokenTtl = accessTtl as NonNullable<JwtSignOptions['expiresIn']>;
    this.refreshTokenTtl = refreshTtl as NonNullable<JwtSignOptions['expiresIn']>;
  }

  async register(dto: RegisterDto): Promise<{ message: string; userId: string }> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 8192,
      parallelism: 2,
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName?.trim() || null,
        role: 'STUDENT',
        emailVerified: true,
        identityVerified: false,
      },
    });

    await this.enqueueEmail(
      'welcome-email',
      {
        type: 'welcome',
        to: email,
        displayName: user.displayName,
      },
      `welcome email for ${email}`,
    );

    return {
      message:
        'Registration successful. A welcome email has been sent to your address.',
      userId: user.id,
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const storedToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gte: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: storedToken.userId },
      data: { emailVerified: true },
    });

    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId: storedToken.userId },
    });

    return { message: 'Email verified successfully' };
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueAndStoreTokens(user.id, user.email, user.role as Role);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash,
        revoked: false,
        expiresAt: { gte: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    return this.issueAndStoreTokens(storedToken.user.id, storedToken.user.email, storedToken.user.role as Role);
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    void email;
    return { message: 'Email verification is no longer required. You can log in now.' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return { message: 'If an account exists, a password reset email has been sent.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 3600 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.enqueueEmail(
      'password-reset-email',
      {
        type: 'password-reset',
        to: user.email,
        token: resetToken,
      },
      `password-reset for ${user.email}`,
    );

    return { message: 'If an account exists, a password reset email has been sent.' };
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const storedToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gte: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 8192,
      parallelism: 2,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: storedToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: storedToken.userId },
      }),
    ]);

    return { message: 'Password reset successfully' };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return { message: 'Logged out' };
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, tokenHash, revoked: false },
      data: { revoked: true },
    });

    return { message: 'Logged out successfully' };
  }

  private issueTokens(userId: string, email: string, role: Role): AuthTokens {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.accessTokenTtl,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.refreshTokenTtl,
    });

    return { accessToken, refreshToken };
  }

  private async issueAndStoreTokens(userId: string, email: string, role: Role): Promise<AuthTokens> {
    const tokens = this.issueTokens(userId, email, role);
    const refreshTokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + ttlToMs(this.refreshTokenTtl)),
      },
    });
    return tokens;
  }

  private async enqueueEmail(
    name: string,
    data: Record<string, unknown>,
    description: string,
  ): Promise<void> {
    const to = data.to as string | undefined;
    const jobId = to ? `email:${name}:${to}` : undefined;
    try {
      await this.emailQueue.add(name, data, {
        attempts: EMAIL_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: EMAIL_JOB_BACKOFF_DELAY },
        removeOnComplete: true,
        removeOnFail: false,
        jobId,
      });
      this.logger.log(`Queued email: ${description}`);
    } catch (error) {
      this.logger.error(
        `Unable to queue email (${name}) for ${to ?? 'unknown'}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}