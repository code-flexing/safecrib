import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReviewSubmissionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'All documents verified and valid.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason?: string;
}

export class ReviewSubmissionActionDto extends ReviewSubmissionDto {
  @ApiProperty({ example: 'd3f7b3e0-7f8d-4e2e-9a0f-0f0f0f0f0f0f' })
  @IsUUID()
  submissionId: string;
}
