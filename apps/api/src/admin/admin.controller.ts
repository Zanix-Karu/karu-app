import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { BookingStatus, VendorStatus } from '@karu/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { AdminService } from './admin.service';
import {
  AdminCreateVehicleDto,
  AdminCreateVendorDto,
  CreateVehicleBlockDto,
  ReviewDocumentDto,
  SetVendorStatusDto,
} from './dto';

/** The MVP internal ops screen backend. Every route is admin-only. */
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  // --- vendor verification queue ---

  @Get('vendors')
  listVendors(@Query('status') status?: VendorStatus) {
    return this.admin.listVendors(status);
  }

  @Patch('vendors/:id/status')
  setVendorStatus(@Param('id') id: string, @Body() dto: SetVendorStatusDto) {
    return this.admin.setVendorStatus(id, dto);
  }

  @Get('documents')
  listDocuments(@Query('status') status?: 'pending' | 'approved' | 'rejected') {
    return this.admin.listDocuments(status);
  }

  @Patch('documents/:id')
  reviewDocument(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.admin.reviewDocument(id, reviewerId, dto);
  }

  // --- on-behalf supply creation ---

  @Post('vendors')
  createVendor(@Body() dto: AdminCreateVendorDto) {
    return this.admin.createVendorOnBehalf(dto);
  }

  @Post('vehicles')
  createVehicle(@Body() dto: AdminCreateVehicleDto) {
    return this.admin.createVehicleOnBehalf(dto);
  }

  // --- availability blocks ---

  @Post('vehicle-blocks')
  createBlock(@CurrentUser('id') adminId: string, @Body() dto: CreateVehicleBlockDto) {
    return this.admin.createBlock(adminId, dto);
  }

  @Delete('vehicle-blocks/:id')
  deleteBlock(@Param('id') id: string) {
    return this.admin.deleteBlock(id);
  }

  // --- bookings oversight ---

  @Get('bookings')
  listBookings(@Query('status') status?: BookingStatus) {
    return this.admin.listBookings(status);
  }
}
