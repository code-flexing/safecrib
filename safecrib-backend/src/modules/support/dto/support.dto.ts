import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupportConversationDto {
  @ApiProperty({ example: 'I cannot upload my proof of studentship.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ example: 'Document upload issue' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;
}

export class CreateSupportMessageDto {
  @ApiProperty({ example: 'I tried again and the upload still fails.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}

export class SupportConversationQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'RESOLVED'], example: 'OPEN' })
  @IsOptional()
  @IsString()
  status?: 'OPEN' | 'RESOLVED';
}

export class ResolveSupportConversationDto {
  @ApiPropertyOptional({ example: 'Issue resolved after correcting the document.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
