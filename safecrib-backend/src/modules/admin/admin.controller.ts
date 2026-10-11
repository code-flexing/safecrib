import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/public.decorator.js';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AdminService } from './admin.service.js';
import { CreateAdminDto, OnboardAgentDto } from './dto/admin.dto.js';
import { IdentityVerificationDto } from './dto/admin.dto.js';
import { ReviewSubmissionActionDto } from './dto/review.dto.js';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('create')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Create an admin account (bootstrap)' })
  @ApiResponse({ status: 201, description: 'Admin account created' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.adminService.createAdmin(dto);
  }

  @Post('onboard')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Manually onboard an agent/landlord (admin)' })
  @ApiResponse({ status: 201, description: 'Agent onboarded' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  onboardAgent(@Body() dto: OnboardAgentDto) {
    return this.adminService.onboardAgent(dto);
  }

  @Get('review-queue')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List profile verification submissions' })
  reviewQueue(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED',
    @Query('tier') tier?: 'STUDENT' | 'LANDLORD',
  ) {
    return this.adminService.listReviewQueue(status, tier);
  }

  @Get('review-queue/:id')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get one profile verification submission' })
  getReviewQueue(@Param('id') id: string) {
    return this.adminService.getReviewQueue(id);
  }

  @Post('review')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Approve or reject a submitted profile' })
  @ApiResponse({ status: 200, description: 'Review submitted' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  review(@Body() dto: ReviewSubmissionActionDto, @CurrentUser() user: { id: string }) {
    return this.adminService.reviewSubmission(dto.submissionId, user.id, dto);
  }

  @Patch('users/:id/verify-identity')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Verify a user\'s identity (admin)' })
  @ApiResponse({ status: 200, description: 'Identity verified' })
  @ApiResponse({ status: 404, description: 'User not found' })
  verifyIdentity(
    @Param('id') id: string,
    @Body() dto: Omit<IdentityVerificationDto, 'userId'>,
  ) {
    return this.adminService.verifyIdentity({ userId: id, ...dto });
  }

  @Get('users')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all non-admin users with filters (admin)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, username, email (min 2 chars)' })
  @ApiQuery({ name: 'role', required: false, enum: ['STUDENT', 'AGENT', 'LANDLORD', 'UNVERIFIED'] })
  @ApiQuery({ name: 'verification', required: false, enum: ['VERIFIED', 'PENDING', 'REJECTED', 'NOT_SUBMITTED'] })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'SUSPENDED'] })
  @ApiQuery({ name: 'flagged', required: false, type: Boolean })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'sort', required: false, enum: ['createdAt', 'email', 'displayName', 'username'] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  @ApiResponse({ status: 200, description: 'Paginated users' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  getUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('verification') verification?: string,
    @Query('status') status?: string,
    @Query('flagged') flagged?: boolean,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('cursor') cursor?: string,
  ) {
    const effectiveSkip = cursor ? parseInt(cursor, 10) : (skip ?? 0);
    return this.adminService.getAllUsers({
      skip: effectiveSkip,
      take: take ?? 20,
      role,
      search,
      verification,
      status,
      flagged,
      from,
      to,
      sort,
      order,
    });
  }

  @Get('users/:id')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get user detail with all sections (admin)' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserDetail(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.adminService.getUserDetail(id, user.id);
  }

  @Post('users/:id/notifications')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a notification from SafeCribs to a user (admin)' })
  @ApiResponse({ status: 201, description: 'Notification sent' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sendUserNotification(
    @Param('id') id: string,
    @Body() dto: { title: string; message: string; link?: string; templateKey?: string },
    @CurrentUser() user: { id: string },
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.adminService.sendAdminNotification(user.id, id, dto, idempotencyKey);
  }

  @Get('users/:id/notifications')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get admin notifications sent to a user (admin)' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated notifications' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserNotifications(
    @Param('id') id: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.adminService.getAdminNotificationsSent(id, skip ?? 0, take ?? 20);
  }

  @Patch('listings/:id/flag')
  @ApiBearerAuth('access-token')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Flag a listing for review (admin)' })
  @ApiResponse({ status: 200, description: 'Listing flagged' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  flagListing(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.adminService.flagListing(id, user.id, reason);
  }
}
