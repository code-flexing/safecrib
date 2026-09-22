import { Worker, Job } from 'bullmq';
import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService, BrevoDeliveryError } from '../../infra/mail/mail.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import { parseRedisConnection } from '../../infra/queue/redis-connection.util.js';
import type { EmailJobData } from '../../infra/mail/mail-job.types.js';

const EMAIL_JOB_ATTEMPTS = 5;
const WORKER_CONCURRENCY = 5;
const WORKER_LOCK_DURATION = 300_000;

@Injectable()
export class EmailProcessor implements OnModuleInit, OnModuleDestroy {
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
        } else if (type === 'provider-contact') {
          await this.mailService.sendProviderContactEmail(
            to,
            job.data.studentName,
            job.data.studentEmail,
            job.data.message,
            job.data.listingTitle,
          );
        } else {
          throw new Error(`Unknown email job type: ${type}`);
        }
      },
      {
        connection: parseRedisConnection(redisUrl),
        concurrency: WORKER_CONCURRENCY,
        lockDuration: WORKER_LOCK_DURATION,
      },
    );

    this.worker.on('active', (job: Job) => {
      this.logger.log(`Email job ${job.id} started for ${job.data.to} (${job.data.type})`);
    });

    this.worker.on('completed', (job: Job) => {
      this.logger.log(`Email job ${job.id} completed for ${job.data.to} (${job.data.type})`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const attemptsMade = job?.attemptsMade ?? 0;
      const details = err instanceof BrevoDeliveryError
        ? `Brevo status=${err.status}; code=${err.code ?? 'none'}; requestId=${err.requestId ?? 'none'}; response=${err.responseBody}`
        : err?.message ?? 'Unknown error';

      this.logger.error(
        `Email job ${job?.id ?? 'unknown'} FAILED after ${attemptsMade}/${EMAIL_JOB_ATTEMPTS} attempts: ${details}`,
        err?.stack,
      );

      this.logger.error(
        `FAILED EMAIL — recipient=${job?.data?.to ?? 'unknown'}; ` +
        `type=${job?.data?.type ?? 'unknown'}; ` +
        `attempts=${attemptsMade}/${EMAIL_JOB_ATTEMPTS}; ` +
        `error=${details}`,
      );

      if (attemptsMade >= EMAIL_JOB_ATTEMPTS - 1) {
        this.logger.error(
          `PERMANENT EMAIL FAILURE — recipient=${job?.data?.to ?? 'unknown'}; ` +
          `type=${job?.data?.type ?? 'unknown'}; all ${EMAIL_JOB_ATTEMPTS} retries exhausted. ` +
          `Manual intervention required. Job data is retained in Redis for inspection.`,
        );
      }
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error(`Email processor worker error: ${err.message}`, err.stack);
    });

    this.worker.on('drained', () => {
      this.logger.log('Email queue drained — all pending jobs processed');
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Email processor worker closed');
    }
  }
}

