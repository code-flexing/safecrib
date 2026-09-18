import { Worker, Job } from 'bullmq';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../infra/mail/mail.service.js';
import { BrevoDeliveryError } from '../../infra/mail/mail.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import { parseRedisConnection } from '../../infra/queue/redis-connection.util.js';

export interface VerificationEmailJobData {
  type: 'verification';
  to: string;
  token: string;
}

export interface PasswordResetEmailJobData {
  type: 'password-reset';
  to: string;
  token: string;
}

export interface WelcomeEmailJobData {
  type: 'welcome';
  to: string;
  displayName?: string | null;
}

export interface StudentApprovalEmailJobData {
  type: 'student-approval';
  to: string;
}

export interface StudentRejectionEmailJobData {
  type: 'student-rejection';
  to: string;
  reason: string;
}

export interface LandlordApprovalEmailJobData {
  type: 'landlord-approval';
  to: string;
}

export interface LandlordRejectionEmailJobData {
  type: 'landlord-rejection';
  to: string;
  reason: string;
}

export type EmailJobData =
  | VerificationEmailJobData
  | PasswordResetEmailJobData
  | WelcomeEmailJobData
  | StudentApprovalEmailJobData
  | StudentRejectionEmailJobData
  | LandlordApprovalEmailJobData
  | LandlordRejectionEmailJobData;

@Injectable()
export class EmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.worker = new Worker<EmailJobData>(
      EMAIL_QUEUE,
      async (job: Job<EmailJobData>) => {
        const { to, type } = job.data;

        if (type === 'verification') {
          await this.mailService.sendVerificationEmail(to, job.data.token);
        } else if (type === 'password-reset') {
          await this.mailService.sendPasswordResetEmail(to, job.data.token);
        } else if (type === 'welcome') {
          await this.mailService.sendWelcomeEmail(to, job.data.displayName);
        } else if (type === 'student-approval') {
          await this.mailService.sendStudentApprovalEmail(to);
        } else if (type === 'student-rejection') {
          await this.mailService.sendStudentRejectionEmail(to, job.data.reason);
        } else if (type === 'landlord-approval') {
          await this.mailService.sendLandlordApprovalEmail(to);
        } else if (type === 'landlord-rejection') {
          await this.mailService.sendLandlordRejectionEmail(to, job.data.reason);
        }
      },
      {
        connection: parseRedisConnection(redisUrl),
      },
    );

    this.worker.on('failed', (job, err) => {
      const details = err instanceof BrevoDeliveryError
        ? `Brevo status=${err.status}; code=${err.code ?? 'none'}; requestId=${err.requestId ?? 'none'}; response=${err.responseBody}`
        : err?.message;
      this.logger.error(`Email job ${job?.id ?? 'unknown'} failed after ${job?.attemptsMade ?? 0} attempts: ${details}`, err?.stack);
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Email job completed for ${job.data.to}`);
    });
  }
}
