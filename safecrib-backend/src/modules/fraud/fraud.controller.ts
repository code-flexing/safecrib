import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { FraudService } from './fraud.service.js';
import { ReportFraudDto } from './dto/fraud.dto.js';

@ApiTags('Fraud')
@ApiBearerAuth('access-token')
@Controller('fraud')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Post('reports')
  @Roles('STUDENT', 'AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Submit a fraud report (student-initiated)' })
  @ApiResponse({ status: 201, description: 'Report submitted' })
  @ApiResponse({ status: 400, description: 'Must specify target' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  reportFraud(@CurrentUser() user: { id: string }, @Body() dto: ReportFraudDto) {
    return this.fraudService.reportFraud(user.id, dto);
  }

  @Get('reports')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List fraud reports (admin)' })
  @ApiResponse({ status: 200, description: 'Array of reports' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  getReports(@Query('status') status?: string) {
    return this.fraudService.getAllReports(0, 50, status);
  }

  @Get('reports/pending')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List pending fraud reports (admin)' })
  @ApiResponse({ status: 200, description: 'Array of pending reports' })
  getPendingReports(
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.fraudService.getPendingReports(skip ?? 0, take ?? 20);
  }

  @Patch('reports/:id/resolve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Resolve a fraud report (admin)' })
  @ApiResponse({ status: 200, description: 'Report resolved' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiResponse({ status: 400, description: 'Report already resolved' })
  resolveReport(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body('status') status: 'CONFIRMED' | 'DISMISSED',
    @Body('notes') notes?: string,
  ) {
    return this.fraudService.resolveFraudReport(id, user.id, status, notes);
  }

  @Get('duplicates/pending')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List pending duplicate flags (admin review queue)' })
  @ApiResponse({ status: 200, description: 'Array of duplicate flags' })
  getPendingDuplicates(
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.fraudService.getPendingDuplicateFlags(skip ?? 0, take ?? 20);
  }

  @Patch('duplicates/:id/resolve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Resolve a duplicate flag (admin)' })
  @ApiResponse({ status: 200, description: 'Flag resolved' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  @ApiResponse({ status: 400, description: 'Flag already resolved' })
  resolveDuplicate(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body('status') status: 'CONFIRMED' | 'DISMISSED',
    @Body('notes') notes?: string,
  ) {
    return this.fraudService.resolveDuplicateFlag(id, user.id, status, notes);
  }
}
