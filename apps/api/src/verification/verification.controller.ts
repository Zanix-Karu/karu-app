import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CustomerVerificationStatus } from '@karu/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { VerificationService } from './verification.service';
import {
  AttachCustomerDocumentDto,
  CustomerDocumentUploadDto,
  ReviewVerificationDto,
  SubmitVerificationDto,
} from './dto';

const STATUSES: CustomerVerificationStatus[] = ['unverified', 'pending', 'verified', 'rejected'];

@Controller()
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get('verification/me')
  mine(@CurrentUser('id') userId: string) {
    return this.verification.mine(userId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verification/documents/upload')
  upload(@CurrentUser('id') userId: string, @Body() dto: CustomerDocumentUploadDto) {
    return this.verification.createUpload(userId, dto.type, dto.file_name);
  }

  @Post('verification/documents')
  attach(@CurrentUser('id') userId: string, @Body() dto: AttachCustomerDocumentDto) {
    return this.verification.attach(userId, dto.type, dto.path);
  }

  @Post('verification/submit')
  submit(@CurrentUser('id') userId: string, @Body() dto: SubmitVerificationDto) {
    return this.verification.submit(userId, dto);
  }

  @Roles('admin')
  @Get('admin/verifications')
  queue(@Query('status') status?: string) {
    const s = STATUSES.find((x) => x === status) ?? 'pending';
    return this.verification.queue(s);
  }

  @Roles('admin')
  @Patch('admin/verifications/:profileId')
  review(@Param('profileId') profileId: string, @Body() dto: ReviewVerificationDto) {
    return this.verification.review(profileId, dto);
  }
}
