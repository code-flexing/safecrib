import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsUUID,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class CreateListingDto {
  @ApiProperty({ example: 'Cozy room near campus' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Spacious room with AC and wifi near main campus' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 50000 })
  @IsInt()
  @Min(1)
  price: number;

  @ApiPropertyOptional({ example: 5000, description: 'Optional discount amount in the same currency as price' })
  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ example: 9.0765 })
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 7.3986 })
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ example: 'University of Abuja' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  campus?: string;

  @ApiPropertyOptional({ example: '123 Campus Road, Abuja' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    example: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    description: 'Google Maps URL, Place ID, or Plus Code used by the client to render the map',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationReference?: string;
}

export class UpdateListingDto {
  @ApiPropertyOptional({ example: 'Updated title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 55000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  price?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ example: 9.0765 })
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ example: 7.3986 })
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ example: 'University of Abuja' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  campus?: string;

  @ApiPropertyOptional({ example: '123 Campus Road, Abuja' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'ChIJN1t_tDeuEmsRUsoyG83frY4' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationReference?: string;

  @ApiPropertyOptional({ example: 2, description: 'Number of bedrooms' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1, description: 'Number of bathrooms' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 'Self-contain', description: 'Property type label' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  propertyType?: string;
}

export class SearchListingsDto {
  @ApiPropertyOptional({ example: 9.0765, description: 'Search latitude' })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 7.3986, description: 'Search longitude' })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'university of abuja', description: 'Campus keyword' })
  @IsOptional()
  @IsString()
  campus?: string;

  @ApiPropertyOptional({ example: 100000, description: 'Max price' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Min price' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 15, description: 'Max results to return (default 15, max 50)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  take?: number;

  @ApiPropertyOptional({ example: 'eyJjcmVhdGVkQXQiOiIyMDI0LTAxLTE1VDAwOjAwOjAwLjAwMFoiLCJpZCI6ImFiYzEyMyJ9', description: 'Base64-encoded cursor for pagination (from previous response nextCursor)' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class AttachListingMediaDto {
  @ApiProperty({ example: 'media-uuid' })
  @IsString()
  @MinLength(1)
  mediaId: string;
}

export class CreateListingCommentDto {
  @ApiPropertyOptional({ example: 'Is the room still available for the next semester?' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body?: string;

  @ApiPropertyOptional({ example: 'comment-uuid', description: 'Parent comment ID for a reply' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Tagged public user IDs' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  mentionUserIds?: string[];
}

export interface ListingResponse {
  id: string;
  title: string;
  description: string | null;
  price: number;
  discountAmount: number | null;
  discountedPrice: number;
  lat: number;
  lng: number;
  campus: string | null;
  address: string | null;
  locationReference: string | null;
  status: string;
  availabilityStatus: 'AVAILABLE' | 'SECURED';
  ownerId: string;
  /** Owner profile fields for social-post card display */
  owner: {
    id: string;
    displayName: string | null;
    profilePicture: string | null;
    /** Resolved from ProviderPage.phone — null when no provider page */
    phone: string | null;
    /** WhatsApp number from provider page additional contacts */
    whatsApp: string | null;
    /** Agency / provider page display name */
    agencyName: string | null;
    verification: {
      stage: string;
      badgeColor: 'green' | 'blue' | 'gold';
    } | null;
  };
  /** Optional property details — null when provider has not filled them in */
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  likeCount: number;
  likedByCurrentUser: boolean;
  commentCount: number;
  /** Number of users who have bookmarked (saved) this listing */
  shareCount: number;
  /** Whether the current viewer has bookmarked this listing (false for unauthenticated) */
  isBookmarked: boolean;
  providerTrustScore: number;
  providerActiveDays: number;
  providerRecommendationCount: number;
  recommendationScore: number;
  viewCount: number;
  followedPage: boolean;
  photos: Array<{
    id: string;
    mediaId: string | null;
    url: string;
    phash: string;
    width: number | null;
    height: number | null;
  }>;
  video: { mediaId: string; durationSec: number | null; width: number | null; height: number | null } | null;
  createdAt: Date;
  updatedAt: Date;
}
