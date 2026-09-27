import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, validate } from 'class-validator';
import { EmptyToNull } from './normalize';
import { WordCountRange } from './word-count-range.validator';

class Dto {
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @WordCountRange()
  bio?: string;
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('WordCountRange', () => {
  it('is valid when the field is absent', async () => {
    const errors = await validate(plainToInstance(Dto, {}));
    expect(errors).toHaveLength(0);
  });

  it('is valid for a blank string (turned into null by EmptyToNull)', async () => {
    const errors = await validate(plainToInstance(Dto, { bio: '   ' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects 49 words', async () => {
    const errors = await validate(plainToInstance(Dto, { bio: words(49) }));
    expect(errors).toHaveLength(1);
  });

  it('accepts 50 words', async () => {
    const errors = await validate(plainToInstance(Dto, { bio: words(50) }));
    expect(errors).toHaveLength(0);
  });

  it('accepts 100 words', async () => {
    const errors = await validate(plainToInstance(Dto, { bio: words(100) }));
    expect(errors).toHaveLength(0);
  });

  it('rejects 101 words', async () => {
    const errors = await validate(plainToInstance(Dto, { bio: words(101) }));
    expect(errors).toHaveLength(1);
  });

  it('rejects a non-string value', async () => {
    const errors = await validate(plainToInstance(Dto, { bio: 12345 }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
