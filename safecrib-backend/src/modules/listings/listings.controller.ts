import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ListingsService } from './listings.service.js';
import { CreateListingDto } from './dto/listing.dto.js';
import { UpdateListingDto } from './dto/listing.dto.js';
import { SearchListingsDto } from './dto/listing.dto.js';

@ApiTags('Listings')
@ApiBearerAuth('access-token')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  @Roles('STUDENT', 'AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Search listings' })
  @ApiResponse({ status: 200, type: [Object] })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  searchListings(@Query() query: SearchListingsDto) {
    return this.listingsService.searchListings(query);
  }

  @Get('my')
  @Roles('AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Get my listings' })
  @ApiResponse({ status: 200, type: [Object] })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  getMyListings(@CurrentUser() user: { id: string }) {
    return this.listingsService.getMyListings(user.id);
  }

  @Get(':id')
  @Roles('STUDENT', 'AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Get a listing by ID' })
  @ApiResponse({ status: 200, type: Object })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  getListings(@Param('id') id: string) {
    return this.listingsService.getListing(id);
  }

  @Post()
  @Roles('AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Create a listing (agents/landlords only)' })
  @ApiResponse({ status: 201, type: Object })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  createListing(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreateListingDto,
  ) {
    return this.listingsService.createListing(
      user.id,
      user.role as any,
      {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        lat: dto.lat,
        lng: dto.lng,
        campus: dto.campus,
        address: dto.address,
      },
    );
  }

  @Post(':id/photos')
  @Roles('AGENT', 'LANDLORD', 'ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a photo for a listing (computes pHash)' })
  @ApiResponse({ status: 200, type: Object })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async uploadPhoto(
    @Param('id') listingId: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Query('url') url?: string,
  ) {
    const imageUrl = url ?? file?.path;
    if (!imageUrl) {
      throw new Error('Either a file upload or a url query param is required');
    }
    const buffer = file?.buffer
      ? file.buffer
      : file?.path
        ? await this.readFileAsBuffer(file.path)
        : undefined;
    return this.listingsService.uploadPhoto(listingId, user.id, imageUrl, buffer);
  }

  private async readFileAsBuffer(path: string): Promise<Buffer | undefined> {
    const fs = await import('node:fs/promises');
    return fs.readFile(path);
  }

  @Patch(':id')
  @Roles('AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Update a listing' })
  @ApiResponse({ status: 200, type: Object })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @HttpCode(HttpStatus.OK)
  updateListing(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateListingDto,
  ) {
    return this.listingsService.updateListing(id, user.id, dto);
  }

  @Delete(':id')
  @Roles('AGENT', 'LANDLORD', 'ADMIN')
  @ApiOperation({ summary: 'Delete (deactivate) a listing' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteListing(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.listingsService.deleteListing(id, user.id);
  }
}
