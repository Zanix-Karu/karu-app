import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { VehiclesService } from './vehicles.service';
import {
  AttachPhotoDto,
  AvailabilityQuery,
  BrowseVehiclesQuery,
  CreateBlockDto,
  CreateVehicleDto,
  RemovePhotoDto,
  UpdateVehicleDto,
  UploadPhotoDto,
} from './dto';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  /** Public marketplace browse. */
  @Public()
  @Get()
  browse(@Query() query: BrowseVehiclesQuery) {
    return this.vehicles.browse(query);
  }

  /** A vendor's own listings. Declared before :id so it isn't shadowed. */
  @Roles('vendor', 'admin')
  @Get('mine')
  mine(@CurrentUser('id') profileId: string, @CurrentUser('role') role: UserRole) {
    return this.vehicles.listForVendorProfile(profileId, role);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.vehicles.getPublicDetail(id);
  }

  /** Is this car free for [from, to]? Public — powers the booking widget. */
  @Public()
  @Get(':id/availability')
  availability(@Param('id') id: string, @Query() query: AvailabilityQuery) {
    return this.vehicles.availability(id, query.from, query.to);
  }

  @Roles('vendor')
  @Post()
  create(@CurrentUser('id') profileId: string, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(profileId, dto);
  }

  /** Start a listing-photo upload (owning vendor or admin). */
  @Roles('vendor', 'admin')
  @Post(':id/photos')
  uploadPhoto(
    @Param('id') id: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UploadPhotoDto,
  ) {
    return this.vehicles.createPhotoUpload(id, profileId, role, dto.file_name);
  }

  /** Record the uploaded photo on the listing. */
  @Roles('vendor', 'admin')
  @Post(':id/photos/attach')
  attachPhoto(
    @Param('id') id: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: AttachPhotoDto,
  ) {
    return this.vehicles.attachPhoto(id, profileId, role, dto.path, dto.angle);
  }

  /** Remove a photo from the listing (owning vendor or admin). */
  @Roles('vendor', 'admin')
  @Delete(':id/photos')
  removePhoto(
    @Param('id') id: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: RemovePhotoDto,
  ) {
    return this.vehicles.removePhoto(id, profileId, role, dto.url);
  }

  /** Edit a listing (owning vendor or admin). */
  @Roles('vendor', 'admin')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(id, profileId, role, { ...dto });
  }

  /** Retire a listing: deactivated if it has bookings, deleted if it never did. */
  @Roles('vendor', 'admin')
  @Delete(':id')
  retire(
    @Param('id') id: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.vehicles.retire(id, profileId, role);
  }

  /** Availability blocks — owning vendor (or admin) manages unavailability. */
  @Roles('vendor', 'admin')
  @Get(':id/blocks')
  listBlocks(
    @Param('id') id: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.vehicles.listBlocks(id, profileId, role);
  }

  @Roles('vendor', 'admin')
  @Post(':id/blocks')
  createBlock(
    @Param('id') id: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: CreateBlockDto,
  ) {
    return this.vehicles.createBlock(id, profileId, role, dto);
  }

  @Roles('vendor', 'admin')
  @Delete(':id/blocks/:blockId')
  deleteBlock(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @CurrentUser('id') profileId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.vehicles.deleteBlock(id, blockId, profileId, role);
  }
}
