import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: 'listing-123' })
  @IsString()
  listingId: string;

  @ApiProperty({ example: 50000, description: 'Deposit amount in minor currency units' })
  @IsInt()
  @Min(0)
  depositAmount: number;
}

export class ConfirmBookingDto {
  @ApiProperty({ example: 15 })
  @IsInt()
  @Min(0)
  depositAmount?: number;
}

export class BookingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  listingId: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty({ enum: ['HELD', 'BOOKED', 'CANCELLED', 'COMPLETED', 'DISPUTED'] })
  status: string;

  @ApiProperty()
  depositAmount: number;

  @ApiProperty({ nullable: true })
  holdExpiresAt: Date | null;

  @ApiProperty({ nullable: true })
  bookedAt: Date | null;

  @ApiProperty({ nullable: true })
  completedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
