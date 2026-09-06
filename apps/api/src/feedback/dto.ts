import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'other'] as const;
export const FEEDBACK_STATUSES = ['new', 'triaging', 'resolved'] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export class CreateFeedbackDto {
  @IsIn(FEEDBACK_CATEGORIES) category!: FeedbackCategory;
  @IsString() @MaxLength(4000) message!: string;
  /** Path the user was on when reporting — speeds triage. */
  @IsOptional() @IsString() @MaxLength(200) page?: string;
  @IsOptional() @IsString() @MaxLength(40) app_version?: string;
  /** Storage paths of already-uploaded screenshots (see /feedback/uploads). */
  @IsOptional() @IsArray() @IsString({ each: true }) image_paths?: string[];
}

/** Ask the API for a signed URL to upload one screenshot. */
export class CreateFeedbackUploadDto {
  @IsString() @MaxLength(120) file_name!: string;
}

/** Admin triage. */
export class UpdateFeedbackDto {
  @IsOptional() @IsIn(FEEDBACK_STATUSES) status?: FeedbackStatus;
  @IsOptional() @IsString() @MaxLength(2000) admin_note?: string;
}
