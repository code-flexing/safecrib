import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import dns from 'node:dns';

import { AppModule } from './app.module.js';
import { RedisSocketAdapter } from './infra/queue/redis-socket.adapter.js';
import { PrismaService } from './infra/prisma/prisma.service.js';
import { QueueService } from './infra/queue/queue.service.js';
import { RedisPolicyService } from './infra/queue/redis-policy.service.js';
import { closeRedis, connectRedis, getRedis } from './lib/redis.js';
import type { Server } from 'node:http';

dns.setDefaultResultOrder('ipv4first');

const logger = new Logger('Bootstrap');
let appInstance: NestExpressApplication | undefined;
let socketAdapter: RedisSocketAdapter | undefined;
let shuttingDown = false;

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

function getAllowedOrigins(): string[] {
  const testingUrl = normalizeOrigin(
    process.env.FRONTEND_URL_TESTING?.trim() || 'http://localhost:3000',
  );
  const productionUrl = normalizeOrigin(
    process.env.FRONTEND_URL_PRODUCTION?.trim() || '',
  );
  const swaggerUrl = normalizeOrigin(
    process.env.FRONTEND_URL_SWAGGER?.trim() || '',
  );
  const extraOrigins =
    process.env.CORS_ORIGINS?.split(',')
      .map((origin) => normalizeOrigin(origin.trim()))
      .filter(Boolean) ?? [];

  const fallbackOrigins = [
    'https://safecrib.onrender.com',
    'https://safecribs.com.ng',
    'https://www.safecribs.com.ng',
  ];

  const origins = [
    productionUrl,
    testingUrl,
    swaggerUrl,
    ...extraOrigins,
    ...fallbackOrigins,
  ].filter((origin): origin is string => Boolean(origin));

  return Array.from(new Set(origins));
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true, // Required for Cloudinary webhook signature verification
  });
  appInstance = app;
  getRedis();
  socketAdapter = new RedisSocketAdapter(app);
  app.useWebSocketAdapter(socketAdapter);

  const isProduction = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 10000;
  const apiPrefix = process.env.API_PREFIX || 'api';

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: isProduction,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      hidePoweredBy: true,
      noSniff: true,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      dnsPrefetchControl: { allow: false },
      ieNoOpen: true,
      xssFilter: true,
    }),
  );

  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.length === 0) {
    logger.warn(
      'No CORS origins configured. Set FRONTEND_URL_PRODUCTION / FRONTEND_URL_TESTING.',
    );
  } else {
    logger.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      logger.warn(`Blocked request from disallowed origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 86400,
  });

  app.setGlobalPrefix(`${apiPrefix}/v1`, {
    exclude: ['healthz', 'readyz'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  const enableSwagger =
    process.env.ENABLE_SWAGGER === 'true';

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(process.env.API_NAME || 'SafeCrib API')
      .setDescription(process.env.API_DESCRIPTION || 'SafeCrib Platform API Documentation')
      .setVersion(process.env.API_VERSION || '1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your access token',
        },
        'access-token',
      )
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, swaggerDocument, {
      useGlobalPrefix: true,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
      customSiteTitle: `${process.env.API_NAME || 'API'} Documentation`,
    });
  }

  await app.listen(port, '0.0.0.0');

  logger.log(JSON.stringify({
    event: 'http_listening',
    host: '0.0.0.0',
    port,
    redisConnectionsPerInstance: 3,
    pgBossPoolMax: 5,
  }));
  initializeDependencies(app);

  const publicUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

  logger.log('Application started successfully');
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`Port: ${port}`);
  logger.log(`API: ${publicUrl}/${apiPrefix}/v1`);

  if (enableSwagger) {
    logger.log(`Swagger: ${publicUrl}/${apiPrefix}/v1/docs`);
  }
}

function initializeDependencies(app: NestExpressApplication): void {
  const prisma = app.get(PrismaService);
  const queues = app.get(QueueService);
  const redisPolicy = app.get(RedisPolicyService);
  let queueConfigurationValid = true;

  try {
    queues.validateConfiguration();
  } catch (error) {
    queueConfigurationValid = false;
    logger.error(JSON.stringify({
      event: 'pgboss_configuration_invalid',
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  void retryDependency('redis', connectRedis).then(async (ready) => {
    if (ready) {
      await redisPolicy.checkPolicy();
      await socketAdapter?.connectToRedis();
    }
  });
  void retryDependency('postgres', () => prisma.connect()).then((ready) => {
    if (ready && queueConfigurationValid) {
      void retryDependency('pg-boss', () => queues.start());
    }
  });
}

async function retryDependency(
  name: string,
  connect: () => Promise<void>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 5 && !shuttingDown; attempt += 1) {
    try {
      await connect();
      logger.log(JSON.stringify({ event: 'dependency_ready', dependency: name }));
      return true;
    } catch (error) {
      if (shuttingDown) return false;
      logger.error(JSON.stringify({
        event: 'dependency_connect_failed',
        dependency: name,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      }));
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** (attempt - 1), 16_000)));
      }
    }
  }

  if (!shuttingDown) {
    logger.warn(JSON.stringify({
      event: 'dependency_degraded',
      dependency: name,
      retryInMs: 30_000,
    }));
    const retryTimer = setTimeout(() => {
      void retryDependency(name, connect);
    }, 30_000);
    retryTimer.unref();
  }
  return false;
}

async function gracefulShutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.log(JSON.stringify({ event: 'shutdown_started', reason }));

  const server = appInstance?.getHttpServer() as Server | undefined;
  let httpClosed: Promise<void> = Promise.resolve();
  if (server?.listening) {
    httpClosed = new Promise((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections?.();
    });
  }

  try {
    await appInstance?.get(QueueService).stop(30_000);
  } catch (error) {
    logger.error(`pg-boss shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await socketAdapter?.dispose();
  } catch (error) {
    logger.error(`Socket.IO shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await closeRedis();
  } catch (error) {
    logger.error(`Redis shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await appInstance?.get(PrismaService).onModuleDestroy();
  } catch (error) {
    logger.error(`Postgres shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const closeTimeout = setTimeout(() => server?.closeAllConnections?.(), 30_000);
  closeTimeout.unref();
  await httpClosed;
  clearTimeout(closeTimeout);
  try {
    await appInstance?.close();
  } catch (error) {
    logger.error(`Application shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = exitCode;
  logger.log(JSON.stringify({ event: 'shutdown_complete', exitCode }));
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason: unknown) => {
  logger.error(JSON.stringify({
    event: 'unhandled_rejection',
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  }));
  void gracefulShutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error: Error) => {
  logger.error(JSON.stringify({
    event: 'uncaught_exception',
    error: error.message,
    stack: error.stack,
  }));
  void gracefulShutdown('uncaughtException', 1);
});

void bootstrap().catch((error: unknown) => {
  logger.error(JSON.stringify({
    event: 'boot_failed',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }));
  void gracefulShutdown('boot_failed', 1);
});
  