import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

describe('SafeCrib Platform (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
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

  it('/api/v1/auth/register (should create verified account + queue welcome email)', async () => {
    const email = `test-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'SuperSecure123!',
        displayName: 'Test Student',
      })
      .expect(201);

    expect(res.body.message).toContain('welcome email');
    expect(res.body.userId).toBeTruthy();

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();
    expect(user!.emailVerified).toBe(true);
  });

  it('/api/v1/auth/register (should reject extra student-profile fields)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `extra-${Date.now()}@example.com`,
        password: 'SuperSecure123!',
        proofOfStudentship: 'student-id.jpg',
        schoolOfStudy: 'University of Abuja',
      })
      .expect(400);
  });

  it('/api/v1/auth/login (should succeed after registration)', async () => {
    const email = `login-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecure123!' });

    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'SuperSecure123!' })
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeTruthy();
        expect(res.body.refreshToken).toBeTruthy();
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
