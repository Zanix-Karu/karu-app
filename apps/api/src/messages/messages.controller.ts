import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto';

@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** The thread for a booking — customer, owning vendor, or admin. */
  @Get('bookings/:id/messages')
  list(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.messages.list(id, userId, role);
  }

  /** Post to the thread. Admin posts appear as Karu Support. */
  @Post('bookings/:id/messages')
  send(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(id, userId, role, dto.message);
  }

  /** Every conversation on the platform — the admin oversight surface. */
  @Roles('admin')
  @Get('admin/conversations')
  conversations(@CurrentUser('id') adminId: string) {
    return this.messages.adminConversations(adminId);
  }
}
