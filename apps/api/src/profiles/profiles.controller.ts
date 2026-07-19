import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  /** The authenticated user's own profile. */
  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.profiles.getById(userId);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(userId, dto);
  }
}
