import { Module } from '@nestjs/common';
import { TrustModule } from '../trust/trust.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
@Module({ imports: [TrustModule], controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
