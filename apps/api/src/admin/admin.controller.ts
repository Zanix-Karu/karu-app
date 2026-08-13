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
import { VendorsService } from '../vendors/vendors.service';
import {
  AdminCreateVehicleDto,
  AdminCreateVendorDto,
  CreateVehicleBlockDto,
  ReviewDocumentDto,
  SetVendorStatusDto,
} from './dto';
import { UploadDocumentDto } from '../vendors/dto';

/** The MVP internal ops screen backend. Every route is admin-only. */
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly vendors: VendorsService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  // --- vendor verification queue ---

  @Get('vendors')
  listVendors(@Query('status') status?: VendorStatus) {
    return this.admin.listVendors(status);
  }

  /** Any vendor's dashboard figures — superadmin oversight. */
  @Get('vendors/:id/stats')
  vendorStats(@Param('id') id: string) {
    return this.vendors.statsForVendorId(id);
  }

  @Patch('vendors/:id/status')
  setVendorStatus(@Param('id') id: string, @Body() dto: SetVendorStatusDto) {
    return this.admin.setVendorStatus(id, dto);
  }

  /**
   * Upload a verification document on a vendor's behalf. Onboarding happens
   * over WhatsApp and in person, so the team often holds the paperwork —
   * this returns the same signed upload URL the vendor flow uses.
   */
  @Post('vendors/:id/documents')
  uploadVendorDocument(@Param('id') id: string, @Body() dto: UploadDocumentDto) {
    return this.vendors.createDocumentUploadForVendor(id, dto);
  }

  @Get('documents')
  listDocuments(
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    // Scoping to one vendor is what lets an admin open a single provider's
    // paperwork from inside that provider's area, rather than the whole queue.
    @Query('vendor_id') vendorId?: string,
  ) {
    return this.admin.listDocuments(status, vendorId);
  }

  /** Short-lived signed link so a reviewer can open the file before deciding. */
  @Get('documents/:id/download')
  documentDownload(@Param('id') id: string) {
    return this.admin.documentDownloadUrl(id);
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
