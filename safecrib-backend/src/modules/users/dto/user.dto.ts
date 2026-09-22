import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Role } from '../../../common/roles.decorator.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: 'STUDENT' })
  @IsOptional()
  @IsEnum(['STUDENT', 'AGENT', 'LANDLORD'])
  role?: Role;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword123' })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({ example: 'NewSecure123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  displayName: string | null;

  @ApiProperty()
  role: Role;

  @ApiProperty()
  emailVerified: boolean;

  @ApiPropertyOptional()
  identityVerified: boolean;

  @ApiPropertyOptional({ type: Number })
  trustScore: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Student profile verification status' })
  studentProfileStatus?: string | null;

  @ApiPropertyOptional({ description: 'Linked student profile, including profile picture and review fields' })
  studentProfile?: Record<string, unknown> | null;
}
