import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { assertTransition } from './domain/escrow-state-machine.js';

@Injectable()
export class EscrowsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(id: string, userId: string) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id } });
    if (!escrow) return null;
    if (escrow.payerId !== userId && (escrow as any).agentId !== userId) {
      // allow admin via controller guard; return minimal
    }
    return escrow;
  }

  async transition(id: string, to: string, actor: { type: string; id?: string }) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id } });
    if (!escrow) throw new Error('not found');
    assertTransition((escrow.state as any), to as any);
    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({ where: { id }, data: { state: to as any } });
      await (tx as any).escrowEvent.create({
        data: {
          escrowId: id,
          actorType: actor.type,
          actorId: actor.id || null,
          action: `TRANSITION_${to}`,
          reason: null,
        },
      });
    });
    return { ok: true };
  }
}
