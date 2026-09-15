import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Role } from '../../../common/roles.decorator.js';

export class OnboardAgentDto {
  @ApiProperty({ example: 'agent@university.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperSecure123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ example: 'John Agent' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ enum: ['AGENT', 'LANDLORD'], example: 'AGENT' })
  @IsOptional()
  @IsEnum(['AGENT', 'LANDLORD'])
  role?: Role;
}

export class IdentityVerificationDto {
  @ApiProperty({ example: 'user-123' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'A123456789' })
  @IsString()
  idDocumentNumber: string;

  @ApiPropertyOptional({ example: 'https://example.com/id-front.jpg' })
  @IsOptional()
  @IsString()
  idDocumentPhotoUrl?: string;
}
