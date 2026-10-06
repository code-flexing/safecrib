import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { MailService, BrevoDeliveryError } from '../../infra/mail/mail.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import { QueueService } from './queue.service.js';
import type { EmailJobData } from '../../infra/mail/mail-job.types.js';

const EMAIL_JOB_ATTEMPTS = 5;
const WORKER_CONCURRENCY = 5;
@Injectable()
export class EmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly queues: QueueService,
  ) {}

  onModuleInit() {
    this.queues.registerWorker<EmailJobData>(
      EMAIL_QUEUE,
      WORKER_CONCURRENCY,
      async (job) => {
        const { to, type } = job.data;
        try {
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
          } else if (type === 'verification-badge') {
            await this.mailService.sendVerificationBadgeEmail(to, job.data);
          } else if (type === 'provider-contact') {
            await this.mailService.sendProviderContactEmail(
              to,
              job.data.studentName,
              job.data.studentEmail,
              job.data.message,
              job.data.listingTitle,
            );
          } else if (type === 'support-message') {
            await this.mailService.sendSupportMessageEmail(
              to,
              job.data.conversationId,
              job.data.message,
            );
          } else {
            throw new Error(`Unknown email job type: ${type}`);
          }
        } catch (error) {
          const details = error instanceof BrevoDeliveryError
            ? `Brevo status=${error.status}; code=${error.code ?? 'none'}; requestId=${error.requestId ?? 'none'}`
            : error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Email job ${job.id} failed on attempt ${job.retryCount + 1}/${EMAIL_JOB_ATTEMPTS}: ${details}`,
            error instanceof Error ? error.stack : undefined,
          );
          throw error;
        }
      },
    );
  }
}
