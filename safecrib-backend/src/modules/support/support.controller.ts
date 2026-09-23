import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  CreateSupportConversationDto,
  CreateSupportMessageDto,
  SupportConversationQueryDto,
} from './dto/support.dto.js';
import { SupportService } from './support.service.js';

@ApiTags('Support')
@ApiBearerAuth('access-token')
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('conversations')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  @ApiOperation({ summary: 'Create a support conversation' })
  createConversation(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSupportConversationDto,
  ) {
    return this.support.createConversation(user.id, dto);
  }

  @Get('conversations')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  @ApiOperation({ summary: 'List the current user support conversations' })
  listConversations(@CurrentUser() user: { id: string }) {
    return this.support.listMyConversations(user.id);
  }

  @Get('conversations/:id')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  getConversation(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.support.getMyConversation(user.id, id);
  }

  @Post('conversations/:id/messages')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  addMessage(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateSupportMessageDto,
  ) {
    return this.support.addUserMessage(user.id, id, dto);
  }
}

@ApiTags('Admin Support')
@ApiBearerAuth('access-token')
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('conversations')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List support conversations for the admin inbox' })
  listConversations(@Query() query: SupportConversationQueryDto) {
    return this.support.listAdminConversations(query.status);
  }

  @Get('conversations/:id')
  @Roles('ADMIN')
  getConversation(@Param('id') id: string) {
    return this.support.getAdminConversation(id);
  }

  @Post('conversations/:id/messages')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reply to a user support conversation' })
  reply(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateSupportMessageDto,
  ) {
    return this.support.replyAsAdmin(user.id, id, dto);
  }

  @Patch('conversations/:id/resolve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Resolve a support conversation' })
  resolve(@Param('id') id: string) {
    return this.support.resolveConversation(id);
  }
}
