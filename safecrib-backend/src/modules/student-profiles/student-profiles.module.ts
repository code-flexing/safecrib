import { Module } from '@nestjs/common';
import { StudentProfilesController } from './student-profiles.controller.js';
import { StudentProfileService } from './student-profiles.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [StudentProfilesController],
  providers: [StudentProfileService],
  exports: [StudentProfileService],
})
export class StudentProfilesModule {}
