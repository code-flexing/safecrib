import { Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const SLOW_REQUEST_THRESHOLD_MS = 500;

type TimingLogger = Pick<Logger, 'warn'>;

export function createHttpTimingMiddleware(
  logger: TimingLogger = new Logger('HttpTiming'),
  now: () => number = () => performance.now(),
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = now();
    let recorded = false;
    const recordCompletion = () => {
      if (recorded) return;
      recorded = true;

      const durationMs = Math.round(now() - startedAt);
      const statusCode = response.writableFinished ? response.statusCode : 499;
      if (durationMs < SLOW_REQUEST_THRESHOLD_MS && statusCode < 500) return;

      const routePath = Array.isArray(request.route?.path)
        ? request.route.path.join('|')
        : request.route?.path;
      const route = `${request.baseUrl ?? ''}${routePath ?? ''}` || 'unmatched';
      logger.warn(JSON.stringify({
        event: 'slow_http_request',
        method: request.method,
        route,
        statusCode,
        durationMs,
      }));
    };

    response.once('finish', recordCompletion);
    response.once('close', recordCompletion);
    next();
  };
}
