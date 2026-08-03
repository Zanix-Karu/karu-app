import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { PaymentStatus } from '@karu/shared';

const RECORDABLE: PaymentStatus[] = ['held', 'released', 'refunded', 'failed'];

export class RecordPaymentDto {
  /** 'held' = deposit received and held; 'released' = paid out to the vendor. */
  @IsIn(RECORDABLE)
  status!: Extract<PaymentStatus, 'held' | 'released' | 'refunded' | 'failed'>;

  /** Bank/transfer reference the team has on file. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
