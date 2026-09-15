import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { TrustModule } from '../trust/trust.module.js';

@Module({
  imports: [TrustModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
