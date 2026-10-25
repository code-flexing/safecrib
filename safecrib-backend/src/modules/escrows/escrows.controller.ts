import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { RequireVerifiedConsumer } from '../../common/student-profile.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@ApiTags('Escrows')
@ApiBearerAuth('access-token')
@Controller('escrows')
export class EscrowsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  @Roles('STUDENT', 'AGENT', 'LANDLORD', 'ADMIN')
  @RequireVerifiedConsumer()
  async get(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id } });
    if (!escrow) return null;
    return escrow;
  }
}
