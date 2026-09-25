import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { NormalizeEmail } from './normalize';

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
