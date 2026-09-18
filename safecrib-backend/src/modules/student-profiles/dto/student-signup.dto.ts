import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StudentSignupDto {
  @ApiProperty({ example: 'student@university.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperSecure123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiProperty({ example: 'student-id-front.jpg' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  proofOfStudentship: string;

  @ApiProperty({ example: 'University of Abuja' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  schoolOfStudy: string;

  @ApiProperty({ example: 'Computer Science' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  courseOfStudy: string;

  @ApiProperty({ example: '300L' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  level: string;

  @ApiProperty({ example: 'profile-photo.jpg' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  profilePicture: string;

  @ApiPropertyOptional({ example: '2001-05-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Female' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '+2348019998888' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContact?: string;

  @ApiPropertyOptional({ example: { linkedin: 'in/jane', website: 'https://example.com' } })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}
