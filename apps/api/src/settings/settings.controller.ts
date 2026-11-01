import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { UpdateAppearanceDto } from './dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** The site-wide light and dark palettes. Public: guests need it too. */
  @Public()
  @Get('appearance')
  appearance() {
    return this.settings.appearance();
  }

  /** Only an admin changes the look for everyone. */
  @Roles('admin')
  @Patch('appearance')
  setAppearance(@CurrentUser('id') adminId: string, @Body() dto: UpdateAppearanceDto) {
    return this.settings.setAppearance(adminId, dto);
  }
}
