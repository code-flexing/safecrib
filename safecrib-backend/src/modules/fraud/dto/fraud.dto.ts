import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReportFraudDto {
  @ApiPropertyOptional({
    enum: ['FAKE_LISTING', 'MISREPRESENTED', 'DOUBLE_BOOKING', 'SCAM_AGENT', 'OTHER'],
    example: 'FAKE_LISTING',
  })
  @IsOptional()
  @IsEnum(['FAKE_LISTING', 'MISREPRESENTED', 'DOUBLE_BOOKING', 'SCAM_AGENT', 'OTHER'])
  type?: string;

  @ApiPropertyOptional({ example: 'listing-123', description: 'Target listing ID' })
  @IsOptional()
  @IsString()
  targetListingId?: string;

  @ApiPropertyOptional({ example: 'user-123', description: 'Target user ID' })
  @IsOptional()
  @IsString()
  targetUserId?: string;

  @ApiProperty({ example: 'This room does not exist in reality' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;
}

export class ReviewDuplicateDto {
  @ApiProperty({ enum: ['CONFIRMED', 'DISMISSED'] })
  @IsEnum(['CONFIRMED', 'DISMISSED'])
  status: string;

  @ApiPropertyOptional({ example: 'Verified as duplicate - same photo' })
  @IsOptional()
  @IsString()
  notes?: string;
}
