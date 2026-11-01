import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import type { UpdateAppearanceDto } from './dto';

export interface Appearance {
  /** Palette everyone sees in light mode. */
  light: string;
  /** Palette everyone sees in dark mode. */
  dark: string;
}

/** What the site looks like before an admin has chosen anything. */
export const DEFAULT_APPEARANCE: Appearance = { light: 'karu', dark: 'karu_night' };

@Injectable()
export class SettingsService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Public: every visitor's first request. Never throws; a missing row or a
   *  database hiccup falls back to the default look. */
  async appearance(): Promise<Appearance> {
    const { data, error } = await this.supabase.db
      .from('site_settings')
      .select('value')
      .eq('key', 'appearance')
      .maybeSingle();
    if (error || !data) return DEFAULT_APPEARANCE;
    const v = data.value as Partial<Appearance>;
    return {
      light: typeof v.light === 'string' ? v.light : DEFAULT_APPEARANCE.light,
      dark: typeof v.dark === 'string' ? v.dark : DEFAULT_APPEARANCE.dark,
    };
  }

  async setAppearance(adminId: string, dto: UpdateAppearanceDto): Promise<Appearance> {
    const value: Appearance = { light: dto.light, dark: dto.dark };
    const { error } = await this.supabase.db
      .from('site_settings')
      .upsert({ key: 'appearance', value, updated_by: adminId }, { onConflict: 'key' });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not save the appearance settings.'));
    return value;
  }
}
