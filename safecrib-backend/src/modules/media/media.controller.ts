import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MediaService } from './services/media.service.js';
import {
  ConfirmUploadDto,
  GetSignedUrlDto,
  RequestUploadSignatureDto,
} from './dto/media.dto.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './providers/storage-provider.interface.js';

@ApiTags('Media')
@ApiBearerAuth('access-token')
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly mediaService: MediaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // ─── POST /media/upload-signature ─────────────────────────────────────────

  @Post('upload-signature')
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // 20 signatures/min per user
  @ApiOperation({
    summary: 'Request a signed upload payload for direct-to-Cloudinary upload',
  })
  @ApiResponse({ status: 201, description: 'Signed upload payload returned' })
  @ApiResponse({ status: 400, description: 'Validation or policy error' })
  @ApiResponse({ status: 429, description: 'Upload quota exceeded' })
  async requestUploadSignature(
    @CurrentUser() user: { id: string },
    @Body() dto: RequestUploadSignatureDto,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.mediaService.requestUploadSignature(user.id, dto);
  }

  // ─── POST /media/:id/confirm ───────────────────────────────────────────────

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm an upload (fallback; webhook is the source of truth)',
  })
  @ApiResponse({ status: 200, description: 'Media confirmed as ready' })
  async confirmUpload(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ConfirmUploadDto,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.mediaService.confirmUpload(id, user.id, dto);
  }

  // ─── GET /media/:id/access ─────────────────────────────────────────────────

  @Get(':id/access')
  @ApiOperation({
    summary:
      'Get a delivery URL. Returns a short-lived signed URL for private/authenticated assets.',
  })
  @ApiResponse({ status: 200, description: 'URL returned' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Media not found or not ready' })
  async getAccessUrl(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
    @Query() query: GetSignedUrlDto,
    @Req() req: Request,
  ) {
    if (!user) throw new UnauthorizedException();
    const ip = req.ip;
    const ua = req.get('user-agent');
    return this.mediaService.getAccessUrl(
      id,
      user.id,
      user.role,
      ip,
      ua,
      query.transformation,
    );
  }

  // ─── DELETE /media/:id ─────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a media asset (owner or admin)' })
  @ApiResponse({ status: 204, description: 'Media scheduled for deletion' })
  async deleteMedia(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (!user) throw new UnauthorizedException();
    await this.mediaService.deleteMedia(id, user.id, user.role);
  }

  // ─── POST /media/webhook (raw body, public endpoint) ──────────────────────

  @Post('webhook')
  @Public() // No JWT — verified via Cloudinary signature header
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cloudinary webhook receiver (internal use)' })
  async handleWebhook(@Req() req: Request) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available');
    }

    const signature = req.headers['x-cld-signature'];
    const timestamp = req.headers['x-cld-timestamp'];

    if (typeof signature !== 'string' || typeof timestamp !== 'string') {
      this.logger.warn('Webhook rejected: missing signature headers');
      return { ok: false };
    }

    const verification = this.storage.verifyWebhook(rawBody, signature, timestamp);
    if (!verification.valid) {
      this.logger.warn(`Webhook rejected: ${verification.reason}`);
      return { ok: false };
    }

    let payload: object;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as object;
    } catch {
      this.logger.warn('Webhook rejected: invalid JSON body');
      return { ok: false };
    }

    // Enqueue and return 200 immediately — processing happens asynchronously
    await this.mediaService.enqueueWebhookJob(payload);

    return { ok: true };
  }
}
