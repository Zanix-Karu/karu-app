import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, Public } from '../auth/decorators';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  /** Public directory of verified vendors. */
  @Public()
  @Get()
  listVerified() {
    return this.vendors.listVerified();
  }

  /** Any authenticated user can register as a vendor. */
  @Post()
  register(@CurrentUser('id') profileId: string, @Body() dto: CreateVendorDto) {
    return this.vendors.create(profileId, dto);
  }

  @Get('me')
  me(@CurrentUser('id') profileId: string) {
    return this.vendors.getByProfile(profileId);
  }
}
