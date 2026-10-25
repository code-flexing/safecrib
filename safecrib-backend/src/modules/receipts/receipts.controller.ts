import { Controller, Get, Param, ForbiddenException, NotFoundException, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { RequireVerifiedConsumer } from '../../common/student-profile.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@ApiTags('Receipts')
@ApiBearerAuth('access-token')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  @Roles('STUDENT', 'AGENT', 'LANDLORD', 'ADMIN')
  @RequireVerifiedConsumer()
  async getReceipt(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        payer: { select: { id: true, displayName: true, email: true } },
        listing: { select: { ownerId: true, title: true, address: true } },
        payment: { select: { reference: true, paidAt: true } },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    const isAdmin = false; // role check via decorator context not needed here; just enforce access
    const allowed = receipt.payerId === user.id || receipt.listing?.ownerId === user.id;
    if (!allowed) {
      throw new ForbiddenException('Not authorized');
    }
    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      paymentId: receipt.paymentId,
      bookingId: receipt.bookingId,
      escrowId: receipt.escrowId,
      payerId: receipt.payerId,
      agentId: receipt.agentId,
      listingId: receipt.listingId,
      currency: receipt.currency,
      totalMinor: receipt.totalMinor,
      status: receipt.status,
      issuedAt: receipt.issuedAt,
      snapshot: receipt.snapshot,
      snapshotHash: receipt.snapshotHash,
      paystackReference: receipt.payment?.reference,
      paidAt: receipt.payment?.paidAt,
    };
  }

  @Get(':id/pdf')
  @Roles('STUDENT', 'AGENT', 'LANDLORD', 'ADMIN')
  @RequireVerifiedConsumer()
  async getReceiptPdf(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      select: { payerId: true, listing: { select: { ownerId: true } } },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    const allowed = receipt.payerId === user.id || receipt.listing?.ownerId === user.id;
    if (!allowed) throw new ForbiddenException('Not authorized');
    // No PDF lib - return printable HTML info via JSON; UI can render print view
    return { message: 'PDF not generated (no PDF library). Use printable HTML view.', receiptId: id };
  }
}
