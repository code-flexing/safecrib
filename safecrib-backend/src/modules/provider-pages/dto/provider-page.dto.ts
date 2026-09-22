import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';

export class PayoutAccount {
  @ApiProperty({ example: 'Opay' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  provider: string;

  @ApiProperty({ example: 'Victory Azuonye' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  accountName: string;

  @ApiProperty({ example: '0987839409' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/, { message: 'Account number must contain digits only' })
  @MinLength(8)
  @MaxLength(20)
  accountNumber: string;
}

export class CreateProviderPageDto {
  @ApiProperty({ example: 'Amina Student Homes' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  displayName: string;

  @ApiPropertyOptional({ example: 'Verified student accommodation provider near campus.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ example: 'business-license.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  proofOfLicense: string;

  @ApiProperty({ example: 'profile-photo.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  profilePicture: string;

  @ApiProperty({ type: PayoutAccount, description: 'At least one payout account required' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayoutAccount)
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  payoutAccounts: PayoutAccount[];

  @ApiPropertyOptional({ enum: ['AGENT', 'LANDLORD'], example: 'LANDLORD' })
  @IsOptional()
  @IsIn(['AGENT', 'LANDLORD'])
  providerType?: 'AGENT' | 'LANDLORD';

  @ApiPropertyOptional({ example: 'Amina Properties' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ example: 'RC1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  businessRegNumber?: string;

  @ApiPropertyOptional({ example: '123 Business Avenue, Abuja' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessAddress?: string;

  @ApiPropertyOptional({ example: ['+2348012345678'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  additionalContactNumbers?: string[];

  @ApiPropertyOptional({ example: { linkedin: 'in/amina', website: 'https://amina.com' } })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}

export class UpdateProviderPageDto {
  @ApiPropertyOptional({ example: 'Amina Student Homes' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Verified student accommodation provider near campus.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'business-license.pdf' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  proofOfLicense?: string;

  @ApiPropertyOptional({ example: 'profile-photo.jpg' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  profilePicture?: string;

  @ApiPropertyOptional({ type: PayoutAccount })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayoutAccount)
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  payoutAccounts?: PayoutAccount[];

  @ApiPropertyOptional({ enum: ['AGENT', 'LANDLORD'], example: 'LANDLORD' })
  @IsOptional()
  @IsIn(['AGENT', 'LANDLORD'])
  providerType?: 'AGENT' | 'LANDLORD';

  @ApiPropertyOptional({ example: 'Amina Properties' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ example: 'RC1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  businessRegNumber?: string;

  @ApiPropertyOptional({ example: '123 Business Avenue, Abuja' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessAddress?: string;

  @ApiPropertyOptional({ example: ['+2348012345678'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  additionalContactNumbers?: string[];

  @ApiPropertyOptional({ example: { linkedin: 'in/amina', website: 'https://amina.com' } })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}

export class ReviewProviderPageDto {
  @ApiPropertyOptional({ example: 'Identity and provider details verified.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 'License name does not match payout account name.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ContactProviderDto {
  @ApiProperty({ example: 'Is this room still available for the next semester?' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Listing the student is asking about' })
  @IsOptional()
  @IsString()
  listingId?: string;
}
