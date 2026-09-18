import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('Reviews')
@ApiBearerAuth('access-token')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Post() @Roles('STUDENT') create(@CurrentUser() user: { id: string }, @Body() dto: CreateReviewDto) { return this.reviews.create(user.id, dto); }
  @Patch(':id/approve') @Roles('ADMIN') approve(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.reviews.moderate(id, user.id, true); }
  @Patch(':id/hide') @Roles('ADMIN') hide(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.reviews.moderate(id, user.id, false); }
}
