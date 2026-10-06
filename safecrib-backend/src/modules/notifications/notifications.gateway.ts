import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

type NotificationSocketUser = { sub?: unknown; exp?: unknown };

function allowedOrigins(): string[] {
  return [
    'http://localhost:3000',
    process.env.FRONTEND_URL_PRODUCTION,
    process.env.FRONTEND_URL_TESTING,
    ...(process.env.CORS_ORIGINS ?? '').split(','),
    'https://safecrib.onrender.com',
    'https://safecribs.com.ng',
    'https://www.safecribs.com.ng',
  ].map((origin) => origin?.trim().replace(/\/+$/, '')).filter((origin): origin is string => Boolean(origin));
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, '');
      const allowed = allowedOrigins().includes(normalized);
      callback(allowed ? null : new Error('Origin is not allowed'), allowed);
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    server.use((client, next) => {
      void this.authenticate(client).then(
        () => next(),
        (error: unknown) => {
          this.logger.warn(
            `Rejected unauthenticated Socket.IO handshake: ${error instanceof Error ? error.message : String(error)}`,
          );
          next(new Error('Unauthorized'));
        },
      );
    });
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    if (typeof client.data?.authenticatedUserId !== 'string') {
      try {
        await this.authenticate(client);
      } catch {
        client.disconnect(true);
        return;
      }
    }
    const userId = client.data.authenticatedUserId;
    if (typeof userId !== 'string') {
      client.disconnect(true);
      return;
    }
    await client.join(this.userRoom(userId));
    client.emit('notifications:ready', { userId });
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || token.length > 4096) {
      throw new Error('Missing or invalid token');
    }
    const payload = await this.jwtService.verifyAsync<NotificationSocketUser>(token, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
    });
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      throw new Error('Invalid token claims');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, emailVerified: true },
    });
    if (!user?.emailVerified) throw new Error('Account is not verified');
    client.data ??= {};
    client.data.authenticatedUserId = user.id;
    this.scheduleExpiry(client, payload.exp * 1000);
  }

  handleDisconnect(client: Socket): void {
    const timer = this.expiryTimers.get(client.id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(client.id);
  }

  emitNotification(userId: string, notification: unknown): void {
    this.server?.to(this.userRoom(userId)).emit('notification:new', notification);
  }

  private userRoom(userId: string): string {
    return `notifications:user:${userId}`;
  }

  private scheduleExpiry(client: Socket, expiresAt: number): void {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      client.disconnect(true);
      return;
    }
    const timer = setTimeout(() => this.scheduleExpiry(client, expiresAt), Math.min(remaining, 2_147_000_000));
    this.expiryTimers.set(client.id, timer);
  }
}
