import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
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
  @Min(0)
  price: number;

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
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 9.0765 })
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ example: 7.3986 })
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SOLD', 'FLAGGED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'SOLD' | 'FLAGGED';

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
}

export class ListingPhotoDto {
  @ApiProperty({ example: 'https://res.cloudinary.com/.../photo.jpg' })
  @IsString()
  @MinLength(1)
  url: string;

  @ApiProperty({ example: 'a1b2c3d4e5f6...' })
  @IsString()
  phash: string;
}

export interface ListingResponse {
  id: string;
  title: string;
  description: string | null;
  price: number;
  lat: number;
  lng: number;
  campus: string | null;
  address: string | null;
  status: string;
  ownerId: string;
  photos: ListingPhotoDto[];
  createdAt: Date;
  updatedAt: Date;
}
