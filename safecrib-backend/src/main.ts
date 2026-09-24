import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import dns from 'node:dns';

import { AppModule } from './app.module.js';

dns.setDefaultResultOrder('ipv4first');

const logger = new Logger('Bootstrap');

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
    'https://pible.onrender.com',
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

  const isProduction = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3001;
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

  app.setGlobalPrefix(`${apiPrefix}/v1`);

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

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const publicUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

  logger.log('Application started successfully');
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`Port: ${port}`);
  logger.log(`API: ${publicUrl}/${apiPrefix}/v1`);

  if (enableSwagger) {
    logger.log(`Swagger: ${publicUrl}/${apiPrefix}/v1/docs`);
  }
}

void bootstrap();
