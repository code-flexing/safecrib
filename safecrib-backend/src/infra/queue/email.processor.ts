import { Worker, Job } from 'bullmq';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../infra/mail/mail.service.js';
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

export type EmailJobData = VerificationEmailJobData | PasswordResetEmailJobData;

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
        const { to, type, token } = job.data;

        if (type === 'verification') {
          await this.mailService.sendVerificationEmail(to, token);
        } else if (type === 'password-reset') {
          await this.mailService.sendPasswordResetEmail(to, token);
        }
      },
      {
        connection: parseRedisConnection(redisUrl),
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Email job failed: ${err?.message}`, err?.stack);
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Email job completed for ${job.data.to}`);
    });
  }
}
