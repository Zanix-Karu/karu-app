import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { EmptyToNull, NormalizeEmail } from './normalize';

class Dto {
  @NormalizeEmail()
  email!: string;
}

describe('NormalizeEmail', () => {
  it('strips internal and surrounding whitespace', () => {
    expect(plainToInstance(Dto, { email: 'm fnalaha @ g mail . com' }).email).toBe('mfnalaha@gmail.com');
  });

  it('lowercases the address', () => {
    expect(plainToInstance(Dto, { email: 'Person@Example.COM' }).email).toBe('person@example.com');
  });

  it('leaves an already-clean address unchanged', () => {
    expect(plainToInstance(Dto, { email: 'person@example.com' }).email).toBe('person@example.com');
  });

  it('passes through a non-string value untouched', () => {
    expect(plainToInstance(Dto, { email: undefined }).email).toBeUndefined();
  });
});

class BlankableDto {
  @EmptyToNull()
  bio?: string;
}

describe('EmptyToNull', () => {
  it('turns a blank string into null', () => {
    expect(plainToInstance(BlankableDto, { bio: '' }).bio).toBeNull();
  });

  it('turns a whitespace-only string into null', () => {
    expect(plainToInstance(BlankableDto, { bio: '   ' }).bio).toBeNull();
  });

  it('leaves non-empty text unchanged', () => {
    expect(plainToInstance(BlankableDto, { bio: 'Family-run since 2019.' }).bio).toBe(
      'Family-run since 2019.',
    );
  });

  it('passes through a non-string value untouched', () => {
    expect(plainToInstance(BlankableDto, { bio: undefined }).bio).toBeUndefined();
  });
});
