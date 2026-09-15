import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/booking.dto.js';
import { ConfirmBookingDto } from './dto/booking.dto.js';
import { BookingResponseDto } from './dto/booking.dto.js';

@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Create a booking (hold a listing)' })
  @ApiResponse({ status: 201, type: BookingResponseDto })
  @ApiResponse({ status: 409, description: 'Listing already held or booked' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  createBooking(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(user.id, dto);
  }

  @Patch(':id/confirm')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Confirm a held booking (pay deposit)' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid state transition' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  confirmBooking(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ConfirmBookingDto,
  ) {
    return this.bookingsService.confirmBooking(user.id, id, dto.depositAmount);
  }

  @Patch(':id/cancel')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Cancel a held or booked listing' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Cannot cancel in current status' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelBooking(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.bookingsService.cancelBooking(id, user.id);
  }

  @Patch(':id/complete')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Mark booking as completed (move-in confirmed)' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot complete in current status' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  completeBooking(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.bookingsService.completeBooking(id, user.id);
  }

  @Patch(':id/dispute')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Raise a dispute on a booking' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot dispute in current status' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  disputeBooking(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body('reason') reason: string,
  ) {
    return this.bookingsService.disputeBooking(id, user.id, reason);
  }

  @Get()
  @Roles('STUDENT')
  @ApiOperation({ summary: 'List current user bookings' })
  @ApiResponse({ status: 200, type: [BookingResponseDto] })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  getMyBookings(@CurrentUser() user: { id: string }) {
    return this.bookingsService.getMyBookings(user.id);
  }

  @Get(':id')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get a booking by ID' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  getBooking(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.bookingsService.getBooking(id, user.id);
  }
}
