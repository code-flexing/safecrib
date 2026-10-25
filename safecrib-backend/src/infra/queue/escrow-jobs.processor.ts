import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from './queue.service.js';

@Injectable()
export class EscrowJobsProcessor implements OnModuleInit {
  private readonly logger = new Logger(EscrowJobsProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly queues: QueueService) {}
  onModuleInit() {
    // Stub - jobs registered as needed
  }
}
