import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AdminService } from './admin.service.js';
import { OnboardAgentDto } from './dto/admin.dto.js';
import { IdentityVerificationDto } from './dto/admin.dto.js';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('onboard')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Manually onboard an agent/landlord (admin)' })
  @ApiResponse({ status: 201, description: 'Agent onboarded' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  onboardAgent(@Body() dto: OnboardAgentDto) {
    return this.adminService.onboardAgent(dto);
  }

  @Patch('users/:id/verify-identity')
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
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all users (admin)' })
  @ApiResponse({ status: 200, description: 'Array of users' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  getUsers(
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('role') role?: string,
  ) {
    return this.adminService.getAllUsers(skip ?? 0, take ?? 50, role);
  }

  @Get('users/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get user detail with trust events (admin)' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('listings/:id/flag')
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
