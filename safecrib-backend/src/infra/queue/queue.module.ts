import { Global, Module } from '@nestjs/common';
import { JobQueueClient, QUEUE_NAMES, QueueService } from './queue.service.js';
import { queueToken } from './queue-injection.js';
import { RedisPolicyService } from './redis-policy.service.js';

const queueProviders = QUEUE_NAMES.map((name) => ({
  provide: queueToken(name),
  useFactory: (queueService: QueueService) =>
    new JobQueueClient(queueService, name),
  inject: [QueueService],
}));

@Global()
@Module({
  providers: [QueueService, RedisPolicyService, ...queueProviders],
  exports: [QueueService, ...queueProviders],
})
export class QueueModule {}
