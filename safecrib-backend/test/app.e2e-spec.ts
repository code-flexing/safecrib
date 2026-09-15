import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';

  describe('SafeCrib Platform (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('/api/v1/auth/register (should reject if email missing)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ password: 'SuperSecure123!' })
      .expect(400);
  });

  it('/api/v1/auth/register (should create student)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `test-${Date.now()}@example.com`,
        password: 'SuperSecure123!',
        displayName: 'Test Student',
      })
      .expect(200)
      .expect({ message: 'Registration successful. Check your email to verify.' });
  });

  it('/api/v1/auth/login (should reject unverified email)', async () => {
    const email = `unverified-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecure123!' });

    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'SuperSecure123!' })
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
