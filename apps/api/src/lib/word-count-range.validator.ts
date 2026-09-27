import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { countWords, VENDOR_BIO_MAX_WORDS, VENDOR_BIO_MIN_WORDS } from '@karu/shared';

@ValidatorConstraint({ name: 'wordCountRange', async: false })
class WordCountRangeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // A non-string is @IsString()'s problem to reject, not this validator's.
    if (typeof value !== 'string') return true;
    const count = countWords(value);
    return count >= VENDOR_BIO_MIN_WORDS && count <= VENDOR_BIO_MAX_WORDS;
  }

  defaultMessage(): string {
    return `Bio must be ${VENDOR_BIO_MIN_WORDS}-${VENDOR_BIO_MAX_WORDS} words`;
  }
}

/**
 * Enforces the vendor bio's 50-100 word rule. Pair with `@IsOptional()` and
 * `@EmptyToNull()` so a blank/absent bio is valid and only non-empty text is
 * range-checked.
 */
export function WordCountRange(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'wordCountRange',
      target: object.constructor,
      propertyName,
      options,
      validator: WordCountRangeConstraint,
    });
  };
}
