import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createHttpTimingMiddleware } from './http-timing.js';

describe('createHttpTimingMiddleware', () => {
  it('logs slow requests using a route template without logging raw URLs', () => {
    let currentTime = 0;
    const logger = { warn: vi.fn() };
    const request = {
      method: 'GET',
      baseUrl: '/api/v1/listings',
      route: { path: '/:id' },
      url: '/api/v1/listings/private-id?token=private-token',
    } as unknown as Request;
    const response = new EventEmitter() as Response;
    Object.defineProperties(response, {
      writableFinished: { value: true, configurable: true },
      statusCode: { value: 503, configurable: true },
    });
    const next = vi.fn() as unknown as NextFunction;
    const middleware = createHttpTimingMiddleware(logger, () => currentTime);

    middleware(request, response, next);
    currentTime = 600;
    response.emit('finish');

    expect(next).toHaveBeenCalledOnce();
    const entry = JSON.parse(String(logger.warn.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      event: 'slow_http_request',
      method: 'GET',
      route: '/api/v1/listings/:id',
      statusCode: 503,
      durationMs: 600,
    });
    expect(JSON.stringify(entry)).not.toContain('private-id');
    expect(JSON.stringify(entry)).not.toContain('private-token');
  });
});
