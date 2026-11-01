import { Matches } from 'class-validator';

/** A theme id from the web app's palette list ("karu", "serika_dark", "8008"). */
const THEME_ID = /^[a-z0-9_]{1,40}$/;

export class UpdateAppearanceDto {
  @Matches(THEME_ID)
  light!: string;

  @Matches(THEME_ID)
  dark!: string;
}
