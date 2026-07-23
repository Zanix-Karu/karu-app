import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { VehiclesService } from './vehicles.service';
import {
  AttachPhotoDto,
  AvailabilityQuery,
  BrowseVehiclesQuery,
  CreateVehicleDto,
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
  @Roles('vendor')
  @Get('mine')
  mine(@CurrentUser('id') profileId: string) {
    return this.vehicles.listForVendorProfile(profileId);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.vehicles.getById(id);
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
    return this.vehicles.attachPhoto(id, profileId, role, dto.path);
  }
}
