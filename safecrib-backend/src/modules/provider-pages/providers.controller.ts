import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ContactProviderDto } from './dto/provider-page.dto.js';
import { ProviderPagesService } from './provider-pages.service.js';

@ApiTags('Providers')
@ApiBearerAuth('access-token')
@Controller('providers')
export class ProvidersController {
  constructor(private readonly pages: ProviderPagesService) {}

  @Post(':id/contact')
  @Roles('STUDENT')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Email a provider Page from an approved student account' })
  contact(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ContactProviderDto,
  ) {
    return this.pages.contact(id, user.id, dto);
  }
}