import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, NearQuery, UpdateVendorDto, UploadDocumentDto } from './dto';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  /** Public directory of operating vendors (verified + pending). */
  @Public()
  @Get()
  listPublic(@Query() near: NearQuery) {
    return this.vendors.listPublic(
      near.near_lat !== undefined && near.near_lng !== undefined
        ? { lat: near.near_lat, lng: near.near_lng }
        : undefined,
    );
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

  /** A provider edits their own record — contact details and delivery pricing. */
  @Roles('vendor')
  @Patch('me')
  updateMe(@CurrentUser('id') profileId: string, @Body() dto: UpdateVendorDto) {
    return this.vendors.updateByProfile(profileId, { ...dto });
  }

  /** Dashboard figures — all derived from real bookings, cars and blocks. */
  @Roles('vendor')
  @Get('me/stats')
  stats(@CurrentUser('id') profileId: string) {
    return this.vendors.statsFor(profileId);
  }

  /** The caller's documents with review status and reviewer notes. */
  @Roles('vendor')
  @Get('me/documents')
  myDocuments(@CurrentUser('id') profileId: string) {
    return this.vendors.listDocuments(profileId);
  }

  /** Start a verification-document upload (returns a signed upload URL). */
  @Roles('vendor')
  @Post('me/documents')
  uploadDocument(@CurrentUser('id') profileId: string, @Body() dto: UploadDocumentDto) {
    return this.vendors.createDocumentUpload(profileId, dto);
  }
}
