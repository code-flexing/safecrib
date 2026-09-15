import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { TrustService } from './trust.service.js';

@ApiTags('Trust')
@ApiBearerAuth('access-token')
@Controller('trust')
export class TrustController {
  constructor(private readonly trustService: TrustService) {}

  @Get('users/:userId')
  @Roles('STUDENT', 'AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Get trust score for a user (visible in profile)' })
  @ApiResponse({ status: 200, description: 'Trust score result' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserTrustScore(@Param('userId') userId: string) {
    return this.trustService.getTrustScore(userId);
  }

  @Get('users/:userId/breakdown')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get full trust score breakdown for a user (admin)' })
  @ApiResponse({ status: 200, description: 'Full trust event breakdown' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserTrustBreakdown(@Param('userId') userId: string) {
    return this.trustService.getTrustScoreBreakdown(userId);
  }

  @Get('me')
  @Roles('STUDENT', 'AGENT', 'LANDLORD')
  @ApiOperation({ summary: 'Get your own trust score' })
  @ApiResponse({ status: 200, description: 'Trust score result' })
  getMyTrustScore(@CurrentUser() user: { id: string }) {
    return this.trustService.getTrustScore(user.id);
  }
}
