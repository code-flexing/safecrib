import { Module } from '@nestjs/common';
import { TrustService } from './trust.service.js';
import { TrustController } from './trust.controller.js';

@Module({
  controllers: [TrustController],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}
