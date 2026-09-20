import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { StudentProfileService } from './student-profiles.service.js';
import { CompleteStudentProfileDto } from './dto/student-signup.dto.js';

@ApiTags('Student Profiles')
@ApiBearerAuth('access-token')
@Controller('student-profiles')
export class StudentProfilesController {
  constructor(private readonly studentProfileService: StudentProfileService) {}

  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Legacy: submit a basic student profile for admin review (no longer used)' })
  @ApiResponse({ status: 201, description: 'Signup submitted for review' })
  @ApiResponse({ status: 400, description: 'Use /student-profiles/complete instead' })
  submitSignup() {
    return this.studentProfileService.submitSignup({} as any);
  }

  @Post('complete')
  @Roles('STUDENT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Complete your student profile and submit for admin review' })
  @ApiResponse({ status: 201, description: 'Profile submitted for review' })
  @ApiResponse({ status: 409, description: 'Already pending or approved' })
  @ApiResponse({ status: 403, description: 'Not a student account' })
  completeProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: CompleteStudentProfileDto,
  ) {
    return this.studentProfileService.completeProfile(user.id, dto);
  }

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get the current student profile and review status' })
  @ApiResponse({ status: 200, description: 'Profile or null if not submitted' })
  getMyProfile(@CurrentUser() user: { id: string }) {
    return this.studentProfileService.getMyProfile(user.id);
  }

  @Get('status')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get the current student profile verification status' })
  @ApiResponse({ status: 200, description: 'Status: NOT_SUBMITTED | PENDING | APPROVED | REJECTED' })
  getStatus(@CurrentUser() user: { id: string }) {
    return this.studentProfileService.getProfileStatus(user.id);
  }

  @Get('submissions/:id')
  @Roles('STUDENT', 'ADMIN')
  @ApiOperation({ summary: 'Get a profile submission by review queue ID' })
  getSubmission(@Param('id') id: string, @CurrentUser() user: { id: string; email: string; role: string }) {
    if (user.role !== 'ADMIN') {
      return this.studentProfileService.getSubmissionForEmail(id, user.email);
    }
    return this.studentProfileService.getSubmission(id);
  }
}