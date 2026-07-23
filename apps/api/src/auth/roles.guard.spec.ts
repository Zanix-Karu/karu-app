import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { UserRole } from '@karu/shared';
import { RolesGuard } from './roles.guard';

const makeGuard = (required: UserRole[] | undefined) =>
  new RolesGuard({ getAllAndOverride: () => required } as unknown as Reflector);

const makeContext = (role?: UserRole) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { id: 'u1', email: null, role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  it('allows any authenticated user when no roles are required', () => {
    expect(makeGuard(undefined).canActivate(makeContext('customer'))).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    expect(makeGuard(['vendor', 'admin']).canActivate(makeContext('vendor'))).toBe(true);
  });

  it('rejects a user whose role is not in the required list', () => {
    expect(() => makeGuard(['admin']).canActivate(makeContext('customer'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no authenticated user at all', () => {
    expect(() => makeGuard(['customer']).canActivate(makeContext())).toThrow(
      ForbiddenException,
    );
  });
});
