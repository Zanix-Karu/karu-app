import { IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  /** Same 2000-char ceiling as the DB CHECK constraint. */
  @IsString()
  @MaxLength(2000)
  message!: string;
}
