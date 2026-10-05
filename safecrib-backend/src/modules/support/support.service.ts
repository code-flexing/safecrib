import {
  ConflictException,
  Logger,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import type {
  CreateSupportConversationDto,
  CreateSupportMessageDto,
} from './dto/support.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    private readonly notifications: NotificationsService,
  ) {}

  async createConversation(userId: string, dto: CreateSupportConversationDto) {
    const body = dto.message.trim();
    const conversation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportConversation.create({
        data: {
          userId,
          subject: dto.subject?.trim() || null,
          messages: {
            create: {
              senderId: userId,
              senderRole: 'USER',
              body,
            },
          },
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      return created;
    });

    await this.notifyAdmins(conversation.id, conversation.messages[0].id, body);
    return conversation;
  }

  async listMyConversations(userId: string) {
    return this.prisma.supportConversation.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async getMyConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Support conversation not found');
    return conversation;
  }

  async addUserMessage(
    userId: string,
    conversationId: string,
    dto: CreateSupportMessageDto,
  ) {
    const conversation = await this.getMyConversation(userId, conversationId);
    if (conversation.status === 'RESOLVED') {
      throw new ConflictException('This support conversation is resolved');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          conversationId,
          senderId: userId,
          senderRole: 'USER',
          body: dto.message.trim(),
        },
      });
      await tx.supportConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    await this.notifyAdmins(conversationId, message.id, message.body);
    return message;
  }

  async listAdminConversations(status?: 'OPEN' | 'RESOLVED') {
    return this.prisma.supportConversation.findMany({
      where: status ? { status } : undefined,
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async getAdminConversation(conversationId: string) {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
        messages: {
          include: { sender: { select: { id: true, email: true, displayName: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Support conversation not found');
    return conversation;
  }

  async replyAsAdmin(
    adminId: string,
    conversationId: string,
    dto: CreateSupportMessageDto,
  ) {
    const conversation = await this.getAdminConversation(conversationId);
    const message = await this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: {
          conversationId,
          senderId: adminId,
          senderRole: 'ADMIN',
          body: dto.message.trim(),
        },
      });
      await tx.supportConversation.update({
        where: { id: conversationId },
        data: { status: 'OPEN', lastMessageAt: message.createdAt },
      });
      return message;
    });
    await this.notifications.enqueue(conversation.user.id, {
      type: 'SUPPORT_REPLY',
      title: 'Support replied',
      body: 'The SafeCrib support team replied to your conversation.',
      href: '/support',
      data: { conversationId },
      dedupeKey: `support-reply:${message.id}`,
    });
    return message;
  }

  async resolveConversation(conversationId: string) {
    await this.getAdminConversation(conversationId);
    return this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: { status: 'RESOLVED' },
    });
  }

  private async notifyAdmins(conversationId: string, messageId: string, message: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', emailVerified: true },
      select: { id: true, email: true },
    });

    await Promise.all(admins.map(async (admin) => {
      await this.notifications.enqueue(admin.id, {
        type: 'SUPPORT_MESSAGE',
        title: 'New support message',
        body: 'A user sent a message to SafeCrib support.',
        href: '/admin/support',
        data: { conversationId },
        dedupeKey: `support-message:${messageId}:${admin.id}`,
      });
      try {
        await this.emailQueue.add('support-message', {
          type: 'support-message',
          to: admin.email,
          conversationId,
          message,
        }, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        });
      } catch (error) {
        this.logger.error(
          `Support email could not be queued for ${conversationId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }));
  }
}
