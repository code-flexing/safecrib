import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface BrevoSendResponse {
  messageId?: string;
  code?: string;
  message?: string;
}

interface EmailTemplateOptions {
  appName: string;
  appUrl: string;
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  tone?: 'default' | 'success' | 'danger' | 'security';
  secondary?: string;
}

export class BrevoDeliveryError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    public readonly requestId: string | undefined,
    public readonly responseBody: string,
  ) {
    super(`Brevo delivery failed: HTTP ${status}${code ? ` (${code})` : ''}${requestId ? `, request ID ${requestId}` : ''}. ${responseBody}`);
    this.name = 'BrevoDeliveryError';
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

function escapeUrl(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL');
    const senderName = this.configService.get<string>('BREVO_SENDER_NAME') || 'SafeCrib';
    const apiUrl = this.configService.get<string>('BREVO_API_URL') || 'https://api.brevo.com/v3/smtp/email';

    if (!apiKey || !senderEmail) {
      const message = 'Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.';
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException(message);
      }
      this.logger.warn(`${message} Email was not sent to ${to}.`);
      return;
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          tags: ['safecrib-transactional'],
        }),
      });

      const rawBody = await response.text();
      const body = (() => {
        try { return JSON.parse(rawBody) as BrevoSendResponse; } catch { return {}; }
      })();
      if (!response.ok) {
        const requestId = response.headers.get('x-request-id')
          || response.headers.get('x-sib-request-id')
          || response.headers.get('request-id')
          || undefined;
        throw new BrevoDeliveryError(
          response.status,
          body.code,
          requestId,
          body.message || rawBody || 'Brevo returned an empty error response',
        );
      }
      this.logger.log(`Brevo email accepted for ${to}: ${subject}${body.messageId ? ` (${body.messageId})` : ''}`);
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
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.sendMail(
      to,
      `Verify your email — ${appName}`,
      this.renderEmail({
        appName,
        appUrl: baseUrl,
        preheader: 'Confirm your email address to activate your SafeCrib account.',
        eyebrow: 'ACCOUNT SECURITY',
        title: 'Confirm your email',
        intro: 'You are almost ready to explore verified student homes, trusted providers, and protected booking holds.',
        body: '<p style="margin:0;color:#59677a;font-size:15px;line-height:1.65;">We sent this message because a SafeCrib account was created with this email address. Confirming your email helps us keep every student and provider accountable.</p>',
        ctaLabel: 'Verify email address',
        ctaUrl: verifyUrl,
        tone: 'security',
        secondary: 'This secure link will take you back to SafeCrib to complete your setup.',
      }),
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const baseUrl = this.configService.get<string>('FRONTEND_URL_TESTING') || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.sendMail(
      to,
      `Reset your password — ${appName}`,
      this.renderEmail({
        appName,
        appUrl: baseUrl,
        preheader: 'A password reset was requested for your SafeCrib account.',
        eyebrow: 'SECURITY REQUEST',
        title: 'Reset your password',
        intro: 'We received a request to reset the password for your SafeCrib account.',
        body: '<p style="margin:0;color:#59677a;font-size:15px;line-height:1.65;">Use the secure button below to choose a new password. Your previous password will stop working as soon as the reset is complete.</p>',
        ctaLabel: 'Reset password',
        ctaUrl: resetUrl,
        tone: 'security',
        secondary: 'If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.',
      }),
    );
  }

  async sendWelcomeEmail(to: string, displayName?: string | null): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const appUrl = this.configService.get<string>('FRONTEND_URL_PRODUCTION')
      || this.configService.get<string>('FRONTEND_URL_TESTING')
      || 'http://localhost:3000';
    const name = escapeHtml(displayName?.trim() || 'there');

    await this.sendMail(
      to,
      `Welcome to ${appName}`,
      this.renderEmail({
        appName,
        appUrl,
        preheader: 'Your SafeCrib account is ready. Start finding a home you can trust.',
        eyebrow: 'WELCOME TO SAFECRIB',
        title: `Welcome, ${name}`,
        intro: 'Your account is ready. SafeCrib brings verified student accommodation, transparent provider profiles, and protected booking holds into one calm experience.',
        body: this.renderFeatureGrid([
          { title: 'Verified homes', text: 'Browse listings that have passed our review checks.' },
          { title: 'Protected holds', text: 'Request a booking hold without paying a risky deposit.' },
          { title: 'Trusted providers', text: 'See provider identity and verification details before you commit.' },
        ]),
        ctaLabel: 'Start exploring',
        ctaUrl: appUrl,
        tone: 'success',
        secondary: 'Need help? Reply to this email and the SafeCrib team will point you in the right direction.',
      }),
    );
  }

  async sendStudentApprovalEmail(to: string): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const appUrl = this.configService.get<string>('FRONTEND_URL_PRODUCTION')
      || this.configService.get<string>('FRONTEND_URL_TESTING')
      || 'http://localhost:3000';

    await this.sendMail(
      to,
      `Your account has been approved — ${appName}`,
      this.renderEmail({
        appName,
        appUrl,
        preheader: 'Your student account is approved and ready to use.',
        eyebrow: 'ACCOUNT APPROVED',
        title: 'Your account is approved',
        intro: 'Your student profile has been reviewed and approved. You can now sign in and start using SafeCrib with confidence.',
        body: this.renderFeatureGrid([
          { title: 'Browse homes', text: 'Search verified student accommodation near your school.' },
          { title: 'Request a hold', text: 'Place a protected booking hold when you find the right room.' },
          { title: 'Stay informed', text: 'Track every booking step from request to completion.' },
        ]),
        ctaLabel: 'Open SafeCrib',
        ctaUrl: appUrl,
        tone: 'success',
        secondary: 'Your account is active now. Keep your profile details up to date so providers can trust your requests.',
      }),
    );
  }

  async sendStudentRejectionEmail(to: string, reason: string): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const appUrl = this.configService.get<string>('FRONTEND_URL_PRODUCTION')
      || this.configService.get<string>('FRONTEND_URL_TESTING')
      || 'http://localhost:3000';

    await this.sendMail(
      to,
      `Your submission was not approved — ${appName}`,
      this.renderEmail({
        appName,
        appUrl,
        preheader: 'Your student profile review needs attention.',
        eyebrow: 'REVIEW UPDATE',
        title: 'Your submission needs attention',
        intro: 'We could not approve your student profile at this time. The review team has left a clear reason so you know what to fix.',
        body: this.renderReasonBox(reason),
        ctaLabel: 'Return to SafeCrib',
        ctaUrl: appUrl,
        tone: 'danger',
        secondary: 'Update the requested information and resubmit your profile when you are ready.',
      }),
    );
  }

  async sendLandlordApprovalEmail(to: string): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const appUrl = this.configService.get<string>('FRONTEND_URL_PRODUCTION')
      || this.configService.get<string>('FRONTEND_URL_TESTING')
      || 'http://localhost:3000';

    await this.sendMail(
      to,
      `Your page/agent profile has been approved — ${appName}`,
      this.renderEmail({
        appName,
        appUrl,
        preheader: 'Your provider Page is approved and live on SafeCrib.',
        eyebrow: 'PAGE APPROVED',
        title: 'Your provider Page is live',
        intro: 'Your Page and provider features have been reviewed and approved. You can now manage your properties and publish verified listings.',
        body: this.renderFeatureGrid([
          { title: 'Publish listings', text: 'Create clear, trustworthy listings for students.' },
          { title: 'Manage requests', text: 'Review booking holds and communicate from one place.' },
          { title: 'Build trust', text: 'Keep your license, payout, and contact details current.' },
        ]),
        ctaLabel: 'Open provider dashboard',
        ctaUrl: appUrl,
        tone: 'success',
        secondary: 'Your provider status is active. SafeCrib will keep your verification details visible to students.',
      }),
    );
  }

  async sendLandlordRejectionEmail(to: string, reason: string): Promise<void> {
    const appName = this.configService.get<string>('API_NAME') || 'SafeCrib';
    const appUrl = this.configService.get<string>('FRONTEND_URL_PRODUCTION')
      || this.configService.get<string>('FRONTEND_URL_TESTING')
      || 'http://localhost:3000';

    await this.sendMail(
      to,
      `Your page/agent submission was not approved — ${appName}`,
      this.renderEmail({
        appName,
        appUrl,
        preheader: 'Your provider Page review needs attention before it can go live.',
        eyebrow: 'PAGE REVIEW UPDATE',
        title: 'Your Page needs attention',
        intro: 'We could not approve your provider Page yet. The review team has left a specific reason so you can correct the submission.',
        body: this.renderReasonBox(reason),
        ctaLabel: 'Return to SafeCrib',
        ctaUrl: appUrl,
        tone: 'danger',
        secondary: 'Correct the requested details and resubmit your Page. It will remain locked until the next review is complete.',
      }),
    );
  }

  private renderEmail(options: EmailTemplateOptions): string {
    const tone = options.tone ?? 'default';
    const tones = {
      default: { header: '#162a52', accent: '#2563eb', soft: '#eef3ff', chip: '#2563eb' },
      success: { header: '#0f766e', accent: '#138a58', soft: '#e7f6ef', chip: '#138a58' },
      danger: { header: '#8f2f2f', accent: '#c0392b', soft: '#fdf2f2', chip: '#c0392b' },
      security: { header: '#5b4b8a', accent: '#6d5ae0', soft: '#f0edff', chip: '#6d5ae0' },
    };
    const palette = tones[tone];
    const cta = options.ctaLabel && options.ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;"><tr><td align="center" style="border-radius:10px;background:${palette.accent};"><a href="${escapeUrl(options.ctaUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;box-shadow:0 4px 14px rgba(23,32,51,.16);"> ${escapeHtml(options.ctaLabel)} </a></td></tr></table>`
      : '';
    const secondary = options.secondary
      ? `<p style="margin:22px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">${escapeHtml(options.secondary)}</p>`
      : '';

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(options.preheader)}</title>
</head>
<body style="margin:0;padding:0;width:100%!important;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(options.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;"><tr><td align="center" style="padding:32px 16px 48px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 34px rgba(21,42,82,.10);">
      <tr><td style="background:${palette.header};padding:24px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:-.4px;color:#ffffff;">Safe<span style="color:#b8c7ff;">Crib</span></td><td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:1.4px;color:#c8d4ff;">${escapeHtml(options.eyebrow)}</td></tr></table></td></tr>
      <tr><td style="padding:42px 40px 44px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr><td style="border-radius:999px;background:${palette.soft};color:${palette.chip};padding:7px 13px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:1.1px;">${escapeHtml(options.eyebrow)}</td></tr></table>
        <h1 style="margin:0;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;letter-spacing:-.7px;line-height:1.18;">${escapeHtml(options.title)}</h1>
        <p style="margin:16px 0 0;color:#59677a;font-size:16px;line-height:1.7;">${escapeHtml(options.intro)}</p>
        ${options.body ?? ''}
        ${cta}
        ${secondary}
      </td></tr>
      <tr><td style="background:#f7f9fc;padding:23px 32px;border-top:1px solid #e7edf5;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">Sent by <strong style="color:#172033;">${escapeHtml(options.appName)}</strong><br>Verified student housing, without the guesswork.</td><td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;">safecrib.com</td></tr></table></td></tr>
    </table>
    <p style="max-width:640px;margin:16px auto 0;color:#7b8494;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;text-align:center;">If the button does not work, copy and paste this link into your browser:<br><span style="color:#59677a;">${escapeHtml(options.ctaUrl ?? options.appUrl)}</span></p>
  </td></tr></table>
</body>
</html>`;
  }

  private renderFeatureGrid(features: Array<{ title: string; text: string }>): string {
    const cells = features.map((feature) => `<td width="33%" valign="top" style="padding:0 10px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e9f1;border-radius:12px;background:#fbfcfe;"><tr><td style="padding:16px;"><div style="width:28px;height:3px;border-radius:3px;background:#2563eb;margin-bottom:13px;"></div><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;color:#172033;line-height:1.35;">${escapeHtml(feature.title)}</div><div style="margin-top:7px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#667085;">${escapeHtml(feature.text)}</div></td></tr></table></td>`).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;border-top:1px solid #edf0f5;padding-top:24px;"><tr>${cells}</tr></table>`;
  }

  private renderReasonBox(reason: string): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-left:4px solid #c0392b;border-radius:8px;background:#fff7f7;padding:17px 18px;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;letter-spacing:.7px;color:#a33232;">REVIEW REASON</td></tr><tr><td style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#5f2525;">${escapeHtml(reason)}</td></tr></table>`;
  }
}
