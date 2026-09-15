import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT') || 587;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP credentials not configured — emails will be logged instead of sent',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    if (!this.configService.get<string>('SMTP_HOST')) {
      this.logger.log(`[DEV] Email to ${to}: ${subject}`);
      this.logger.verbose(`[DEV] HTML: ${html}`);
      return;
    }

    try {
      const from = this.configService.get<string>('SMTP_FROM') || 'noreply@safecrib.app';
      await this.getTransporter().sendMail({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const baseUrl = this.configService.get<string>('FRONTEND_URL_TESTING') || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

    const html = `
      <h1>${appName} - Email Verification</h1>
      <p>Please click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
    `;

    await this.sendMail(to, `${appName} - Verify your email`, html);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const baseUrl = this.configService.get<string>('FRONTEND_URL_TESTING') || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    const html = `
      <h1>${appName} - Password Reset</h1>
      <p>You requested a password reset. Click the link below:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
    `;

    await this.sendMail(to, `${appName} - Password Reset`, html);
  }
}
