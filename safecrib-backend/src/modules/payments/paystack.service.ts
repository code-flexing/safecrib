import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PaystackInitResponse {
  status: boolean;
  data?: {
    authorization_url: string;
    reference: string;
    access_code: string;
  };
  message?: string;
}

interface PaystackVerifyResponse {
  status: boolean;
  data?: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paid_at: string | null;
    channel: string;
    customer: { email: string };
    metadata: Record<string, unknown> | null;
  };
  message?: string;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private static readonly API_BASE = 'https://api.paystack.co';

  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    return this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '';
  }

  /** Returns the configured public key (for embedding in the client checkout). */
  publicKey(): string {
    return this.config.get<string>('PAYSTACK_PUBLIC_KEY') ?? '';
  }

  private async request<T>(endpoint: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${PaystackService.API_BASE}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secret()}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    });
    const json = (await res.json().catch(() => null)) as T | null;
    if (!json) {
      throw new BadRequestException('Invalid response from payment provider');
    }
    return json;
  }

  async initialize(params: {
    email: string;
    amountMinor: number;
    reference: string;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }) {
    const json = await this.request<PaystackInitResponse>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: params.email,
        amount: params.amountMinor,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
      }),
    });
    if (!json?.status || !json.data?.authorization_url) {
      this.logger.error('Paystack initialize failed', JSON.stringify(json));
      throw new BadRequestException(json?.message || 'paystack init failed');
    }
    return {
      authorizationUrl: json.data.authorization_url,
      reference: json.data.reference,
      accessCode: json.data.access_code,
    };
  }

  async verify(reference: string) {
    const json = await this.request<PaystackVerifyResponse>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      { method: 'GET' },
    );
    return json?.data ?? null;
  }
}