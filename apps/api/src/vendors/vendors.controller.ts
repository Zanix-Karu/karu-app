import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UploadDocumentDto } from './dto';

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

  /** Dashboard figures — all derived from real bookings, cars and blocks. */
  @Roles('vendor')
  @Get('me/stats')
  stats(@CurrentUser('id') profileId: string) {
    return this.vendors.statsFor(profileId);
  }

  /** Start a verification-document upload (returns a signed upload URL). */
  @Roles('vendor')
  @Post('me/documents')
  uploadDocument(@CurrentUser('id') profileId: string, @Body() dto: UploadDocumentDto) {
    return this.vendors.createDocumentUpload(profileId, dto.type);
  }
}
