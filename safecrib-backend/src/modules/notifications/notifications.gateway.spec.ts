import { describe, expect, it, vi } from 'vitest';
import { NotificationsGateway } from './notifications.gateway.js';

describe('NotificationsGateway', () => {
  it('only joins the room belonging to a verified token user', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 60,
    }) };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', emailVerified: true }) },
    };
    const gateway = new NotificationsGateway(
      jwtService as never,
      { get: vi.fn().mockReturnValue('secret') } as never,
      prisma as never,
    );
    const client = {
      id: 'socket-1',
      handshake: { auth: { token: 'access-token' } },
      join: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith('notifications:user:user-1');
    expect(client.emit).toHaveBeenCalledWith('notifications:ready', { userId: 'user-1' });
    expect(client.disconnect).not.toHaveBeenCalled();
    gateway.handleDisconnect(client as never);
  });

  it('disconnects clients without a token before querying account data', async () => {
    const jwtService = { verifyAsync: vi.fn() };
    const prisma = { user: { findUnique: vi.fn() } };
    const gateway = new NotificationsGateway(
      jwtService as never,
      { get: vi.fn() } as never,
      prisma as never,
    );
    const client = {
      id: 'socket-2',
      handshake: { auth: {} },
      join: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
