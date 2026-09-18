import { Module } from '@nestjs/common';
import { StudentProfilesController } from './student-profiles.controller.js';
import { StudentProfileService } from './student-profiles.service.js';

@Module({
  controllers: [StudentProfilesController],
  providers: [StudentProfileService],
  exports: [StudentProfileService],
})
export class StudentProfilesModule {}
