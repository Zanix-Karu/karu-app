import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { VehiclesService } from './vehicles.service';
import { BrowseVehiclesQuery, CreateVehicleDto } from './dto';

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

  @Roles('vendor')
  @Post()
  create(@CurrentUser('id') profileId: string, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(profileId, dto);
  }
}
