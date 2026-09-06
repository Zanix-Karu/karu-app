import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto, CreateFeedbackUploadDto, UpdateFeedbackDto } from './dto';

@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /** Any signed-in user (customer or vendor — admins too) can send feedback. */
  @Post('feedback')
  create(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedback.create(userId, role, dto);
  }

  /** Signed URL to upload one screenshot before submitting. */
  @Post('feedback/uploads')
  upload(@CurrentUser('id') userId: string, @Body() dto: CreateFeedbackUploadDto) {
    return this.feedback.createImageUpload(userId, dto.file_name);
  }

  /** The caller's own reports. */
  @Get('feedback/mine')
  mine(@CurrentUser('id') userId: string) {
    return this.feedback.listMine(userId);
  }

  // --- admin queue ---------------------------------------------------------

  @Roles('admin')
  @Get('admin/feedback')
  list(@Query('status') status?: string) {
    return this.feedback.listAll(status);
  }

  @Roles('admin')
  @Patch('admin/feedback/:id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateFeedbackDto,
  ) {
    return this.feedback.updateStatus(id, adminId, dto);
  }
}
