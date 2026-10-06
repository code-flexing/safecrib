import { Inject } from '@nestjs/common';
import type { QueueName } from './queue.service.js';

export function queueToken(name: QueueName): string {
  return `SAFECRIB_JOB_QUEUE:${name}`;
}

export function InjectJobQueue(name: QueueName): ParameterDecorator {
  return Inject(queueToken(name));
}
