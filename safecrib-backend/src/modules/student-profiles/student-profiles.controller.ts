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
import { StudentSignupDto } from './dto/student-signup.dto.js';

@ApiTags('Student Profiles')
@ApiBearerAuth('access-token')
@Controller('student-profiles')
export class StudentProfilesController {
  constructor(private readonly studentProfileService: StudentProfileService) {}

  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a basic student profile for admin review' })
  @ApiResponse({ status: 201, description: 'Signup submitted for review' })
  @ApiResponse({ status: 409, description: 'A pending or approved signup already exists' })
  submitSignup(@Body() dto: StudentSignupDto) {
    return this.studentProfileService.submitSignup(dto);
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

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get the current student profile submission' })
  getMySubmission(@CurrentUser() user: { id: string; email: string }) {
    return this.studentProfileService.getSubmissionByEmail(user.email);
  }
}
