import { describe, expect, it } from 'vitest';
import { hydra, mayChangeRole, powerLevel, roleOf } from './map';

describe('roles (D-06, D-25)', () => {
  it('levels: creators of version 12 rooms outrank everyone; otherwise users, then users_default', () => {
    const facts = { creators: ['@sofia:x'], users: { '@ingrid:x': 50, '@odd:x': 'high' }, usersDefault: 0 };
    expect(powerLevel(facts, '@sofia:x')).toBe(Infinity);
    expect(powerLevel(facts, '@ingrid:x')).toBe(50);
    expect(powerLevel(facts, '@odd:x')).toBe(0);
    expect(powerLevel({ creators: [], usersDefault: 10 }, '@jonas:x')).toBe(10);
    expect([hydra('12'), hydra('13'), hydra('org.matrix.hydra.11'), hydra('11'), hydra(undefined)]).toEqual([true, true, true, false, false]);
  });

  it('role from level and home space', () => {
    expect(roleOf(Infinity, 'workspace')).toBe('owner');
    expect(roleOf(100, 'workspace')).toBe('owner');
    expect(roleOf(50, 'workspace')).toBe('admin');
    expect(roleOf(0, 'workspace')).toBe('staff');
    expect(roleOf(0, 'client')).toBe('client');
    expect(roleOf(0, 'none')).toBe('external');
  });

  it('who may change roles', () => {
    expect(mayChangeRole(100, 0, 'owner', false)).toBe(true);
    expect(mayChangeRole(50, 0, 'owner', false)).toBe(false);
    expect(mayChangeRole(50, 0, 'admin', false)).toBe(true);
    expect(mayChangeRole(0, 0, 'admin', false)).toBe(false);
    // Matrix: not someone at or above my level...
    expect(mayChangeRole(50, 50, 'staff', false)).toBe(false);
    expect(mayChangeRole(100, 100, 'admin', false)).toBe(false);
    expect(mayChangeRole(Infinity, 100, 'admin', false)).toBe(true);
    // ...except myself.
    expect(mayChangeRole(100, 100, 'admin', true)).toBe(true);
    expect(mayChangeRole(50, 50, 'staff', true)).toBe(true);
  });
});
