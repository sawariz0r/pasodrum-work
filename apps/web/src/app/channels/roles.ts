// Who can do what (RulesM4, D-06, D-25, D-36 PeopleRules). The UI hides what you can't do (D-19); the server still decides.
import type { Role, Space } from '../../matrix';

export type AddRole = 'staff' | 'external' | 'client';

const team = (r?: Role) => r === 'owner' || r === 'admin' || r === 'staff';

export function canManage(r?: Role) {
  return r === 'owner' || r === 'admin';
}

/** Workspace: Owners, Admins, Staff. Client space: its own team, never clients. */
export function canCreateIn(r?: Role) {
  return team(r);
}

export function canBrowse(r?: Role) {
  return team(r) || r === 'client';
}

/** Add people is offered here (D-36): the team of this space (Owners, Admins, Staff); never Externals or clients. */
export function canAddPeople(space: Space | undefined, r?: Role): boolean {
  return !!space && team(r);
}

/** Owners and Admins pick a type first (PeopleAddStaff/External/Client); everyone else gets no type picker. */
export function addTypes(r?: Role): AddRole[] {
  return canManage(r) ? ['staff', 'external', 'client'] : [];
}

/** A new person by email in a workspace channel (a one-off External): Owners and Admins only (PeopleAddStaffOnly). */
export function canAddNew(r?: Role): boolean {
  return canManage(r);
}

/** D-25 with the power-level limit: nobody switches their own role, and nobody can demote an Owner. */
export function roleChoices(mine: Role | undefined, theirs: Role, self: boolean): ('owner' | 'admin' | 'staff')[] {
  if (self || (theirs !== 'admin' && theirs !== 'staff')) return [];
  if (mine === 'owner') return ['owner', 'admin', 'staff'];
  if (mine === 'admin') return ['admin', 'staff'];
  return [];
}

/** Taking someone out of a client space: Owners remove anyone but themselves; Admins never Owners or other Admins (D-25, D-27). */
export function canRemoveFromSpace(mine: Role | undefined, theirs: Role, self: boolean): boolean {
  if (self || !canManage(mine)) return false;
  return mine === 'owner' || (theirs !== 'owner' && theirs !== 'admin');
}

/** Channel names: lowercase, spaces become hyphens, 80 max. */
export function channelSlug(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, '-').slice(0, 80);
}
