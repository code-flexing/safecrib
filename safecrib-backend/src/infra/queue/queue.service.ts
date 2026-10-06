import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import type { Job, JobOptions, QueueOptions, WorkOptions } from 'pg-boss';

export const QUEUE_NAMES = [
  'email',
  'image-hash',
  'trust-recompute',
  'booking-hold-expiry',
  'duplicate-sweep',
  'media-webhook',
  'media-deletion',
  'media-cleanup',
  'notifications',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
export type QueueJobHandler<T> = (job: Job<T>) => Promise<void>;

export interface QueueAddOptions {
  attempts?: number;
  backoff?: { type?: string; delay?: number };
  delay?: number;
  jobId?: string;
  removeOnComplete?: boolean | number | { age?: number; count?: number };
  removeOnFail?: boolean | number | { age?: number; count?: number };
}

interface WorkerRegistration<T> {
  name: QueueName;
  concurrency: number;
  rateLimit?: { max: number; durationMs: number };
  handler: QueueJobHandler<T>;
  starts: number[];
}

const COMPLETED_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const PENDING_JOB_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const DEAD_LETTER_RETENTION_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly workers: WorkerRegistration<unknown>[] = [];
  private boss: PgBoss | undefined;
  private started = false;

  registerWorker<T>(
    name: QueueName,
    concurrency: number,
    handler: QueueJobHandler<T>,
    rateLimit?: { max: number; durationMs: number },
  ): void {
    this.workers.push({
      name,
      concurrency,
      rateLimit,
      handler: handler as QueueJobHandler<unknown>,
      starts: [],
    });
  }

  async start(): Promise<void> {
    if (this.started) return;

    const connectionString = this.validateConfiguration();
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const boss = new PgBoss({
        connectionString,
        max: 5,
        ssl: { rejectUnauthorized: false },
        schema: 'pgboss',
        application_name: 'safecrib-pgboss',
      });
      boss.on('error', (error: Error) => {
        this.logger.error(`pg-boss error: ${error.message}`, error.stack);
      });
      boss.on('warning', (warning) => {
        this.logger.warn(`pg-boss warning: ${JSON.stringify(warning)}`);
      });

      try {
        await boss.start();
        this.boss = boss;
        await this.createQueues(boss);
        await this.registerWorkers(boss);
        await boss.schedule('media-cleanup', '*/5 * * * *', {});
        this.started = true;
        this.logger.log('pg-boss started with a dedicated pool (max=5, schema=pgboss)');
        return;
      } catch (error) {
        lastError = error;
        this.logger.error(
          `pg-boss startup attempt ${attempt}/3 failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        await boss.stop({ timeout: 5_000 }).catch((stopError: unknown) => {
          this.logger.warn(
            `Could not stop failed pg-boss startup: ${stopError instanceof Error ? stopError.message : String(stopError)}`,
          );
        });
        if (this.boss === boss) this.boss = undefined;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
        }
      }
    }

    throw new Error(
      `pg-boss could not start after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      { cause: lastError },
    );
  }

  validateConfiguration(): string {
    const connectionString = process.env.PGBOSS_DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error('PGBOSS_DATABASE_URL is required to start pg-boss workers');
    }

    let parsed: URL;
    try {
      parsed = new URL(connectionString);
    } catch {
      throw new Error('PGBOSS_DATABASE_URL must be a valid PostgreSQL URL');
    }
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new Error('PGBOSS_DATABASE_URL must use the PostgreSQL URL scheme');
    }
    if (parsed.port === '6543') {
      throw new Error(
        'PGBOSS_DATABASE_URL uses port 6543 (Supabase transaction pooler); pg-boss requires the Supabase session pooler on port 5432',
      );
    }
    if (parsed.port && parsed.port !== '5432') {
      throw new Error('PGBOSS_DATABASE_URL must use port 5432 for the Supabase session pooler');
    }
    for (const option of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      parsed.searchParams.delete(option);
    }
    return parsed.toString();
  }

  async stop(timeoutMs = 30_000): Promise<void> {
    if (!this.boss) return;
    const boss = this.boss;
    this.boss = undefined;
    this.started = false;
    await boss.stop({ timeout: timeoutMs, graceful: true });
    this.logger.log('pg-boss workers and database pool stopped');
  }

  get isReady(): boolean {
    return this.started;
  }

  onModuleDestroy(): Promise<void> {
    return this.stop(30_000);
  }

  async send(
    queue: QueueName,
    _jobName: string,
    data: object,
    options: QueueAddOptions = {},
  ): Promise<string | null> {
    const boss = this.requireBoss();
    const jobOptions: JobOptions & {
      retryLimit: number;
      retryDelay: number;
      retryBackoff: boolean;
      deleteAfterSeconds: number;
      retentionSeconds: number;
      expireInSeconds: number;
    } = {
      retryLimit: Math.max(0, (options.attempts ?? 1) - 1),
      retryDelay: options.backoff?.delay
        ? Math.max(1, Math.ceil(options.backoff.delay / 1_000))
        : 0,
      retryBackoff: options.backoff?.type === 'exponential',
      deleteAfterSeconds: options.removeOnComplete === true
        ? 60 * 60
        : COMPLETED_JOB_RETENTION_SECONDS,
      retentionSeconds: PENDING_JOB_RETENTION_SECONDS,
      expireInSeconds: 30 * 60,
    };

    if (options.delay) {
      jobOptions.startAfter = new Date(Date.now() + options.delay);
    }
    if (options.jobId) {
      jobOptions.singletonKey = options.jobId;
      jobOptions.singletonSeconds = PENDING_JOB_RETENTION_SECONDS;
    }

    return boss.send(queue, data, jobOptions);
  }

  private requireBoss(): PgBoss {
    if (!this.started || !this.boss) {
      throw new Error('pg-boss is not ready; the job was not enqueued');
    }
    return this.boss;
  }

  private async createQueues(boss: PgBoss): Promise<void> {
    for (const name of QUEUE_NAMES) {
      const deadLetter = `${name}-dead-letter`;
      const deadLetterOptions: Omit<QueueOptions, 'name'> = {
        retryLimit: 0,
        deleteAfterSeconds: DEAD_LETTER_RETENTION_SECONDS,
        retentionSeconds: DEAD_LETTER_RETENTION_SECONDS,
      };
      await boss.createQueue(deadLetter, deadLetterOptions);
      await boss.createQueue(name, {
        deadLetter,
        retryLimit: 0,
        deleteAfterSeconds: COMPLETED_JOB_RETENTION_SECONDS,
        retentionSeconds: PENDING_JOB_RETENTION_SECONDS,
        expireInSeconds: 30 * 60,
      });
    }
  }

  private async registerWorkers(boss: PgBoss): Promise<void> {
    for (const worker of this.workers) {
      const options: WorkOptions = {
        batchSize: 1,
        localConcurrency: worker.concurrency,
        pollingIntervalSeconds: 2,
      };
      await boss.work<unknown>(worker.name, options, async (jobs) => {
        const job = jobs[0];
        if (!job) return;
        try {
          await this.waitForRateLimit(worker);
          await worker.handler(job);
        } catch (error) {
          this.logger.error(
            `Job failed: queue=${worker.name} id=${job.id} attempt=${job.retryCount + 1} error=${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
          throw error;
        }
      });
      this.logger.log(
        `Registered pg-boss worker: queue=${worker.name} concurrency=${worker.concurrency}`,
      );
    }
  }

  private async waitForRateLimit(worker: WorkerRegistration<unknown>): Promise<void> {
    if (!worker.rateLimit) return;
    while (true) {
      const now = Date.now();
      worker.starts = worker.starts.filter(
        (startedAt) => now - startedAt < worker.rateLimit!.durationMs,
      );
      if (worker.starts.length < worker.rateLimit.max) {
        worker.starts.push(now);
        return;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(1, worker.rateLimit!.durationMs - (now - worker.starts[0])),
        ),
      );
    }
  }
}

export class JobQueueClient {
  constructor(
    private readonly queueService: QueueService,
    private readonly name: QueueName,
  ) {}

  add(
    jobName: string,
    data: object,
    options?: QueueAddOptions,
  ): Promise<string | null> {
    return this.queueService.send(this.name, jobName, data, options);
  }
}
