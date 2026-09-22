import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  CreateProviderPageDto,
  ContactProviderDto,
  ReviewProviderPageDto,
  UpdateProviderPageDto,
} from './dto/provider-page.dto.js';
import { ProviderPagesService } from './provider-pages.service.js';

@ApiTags('Provider Pages')
@ApiBearerAuth('access-token')
@Controller('provider-pages')
export class ProviderPagesController {
  constructor(private readonly pages: ProviderPagesService) {}

  @Get('me')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  getMine(@CurrentUser() user: { id: string }) {
    return this.pages.getMine(user.id);
  }

  @Post()
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create or replace a rejected provider Page' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateProviderPageDto) {
    return this.pages.create(user.id, dto);
  }

  @Patch('me')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update a draft or rejected provider Page' })
  update(@CurrentUser() user: { id: string }, @Body() dto: UpdateProviderPageDto) {
    return this.pages.update(user.id, dto);
  }

  @Post('me/submit')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  submit(@CurrentUser() user: { id: string }) {
    return this.pages.submit(user.id);
  }

  @Post(':id/contact')
  @Roles('STUDENT')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Email a provider Page from an approved student account' })
  contact(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ContactProviderDto,
  ) {
    return this.pages.contact(id, user.id, dto);
  }

  @Get('admin/pending')
  @Roles('ADMIN')
  pending() {
    return this.pages.listPending();
  }

  @Patch(':id/verify')
  @Roles('ADMIN')
  verify(@Param('id') id: string, @CurrentUser() user: { id: string }, @Body() dto: ReviewProviderPageDto) {
    return this.pages.review(id, user.id, true, dto.reason ?? dto.notes);
  }

  @Patch(':id/reject')
  @Roles('ADMIN')
  reject(@Param('id') id: string, @CurrentUser() user: { id: string }, @Body() dto: ReviewProviderPageDto) {
    return this.pages.review(id, user.id, false, dto.reason ?? dto.notes);
  }
}
