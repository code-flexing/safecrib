import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PAYMENT_RECONCILE_QUEUE } from '../../infra/queue/queue.constants.js';
import { QueueService } from './queue.service.js';

@Injectable()
export class PaymentReconcileProcessor implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconcileProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  onModuleInit() {
    this.queues.registerWorker(
      PAYMENT_RECONCILE_QUEUE,
      1,
      async () => {
        // Minimal stub - reconcile logic will be expanded in full implementation
        this.logger.log('Payment reconcile sweep executed (stub)');
      },
    );
  }
}
