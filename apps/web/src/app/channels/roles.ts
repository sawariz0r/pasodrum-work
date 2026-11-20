// Who can do what (RulesM4, D-06, D-25). The UI hides what you can't do (D-19); the server still decides.
import type { Role, Space } from '../../matrix';

export type AddRole = 'member' | 'guest' | 'client';

const team = (r?: Role) => r === 'owner' || r === 'admin' || r === 'member';

export function canManage(r?: Role) {
  return r === 'owner' || r === 'admin';
}

/** Workspace: Owners, Admins, Members. Client space: its own team, never clients. */
export function canCreateIn(r?: Role) {
  return team(r);
}

export function canBrowse(r?: Role) {
  return team(r) || r === 'client';
}

/** The roles Add people offers here, or none when you can't add people. */
export function addRoles(space: Space | undefined, r?: Role): AddRole[] {
  if (!space || !team(r)) return [];
  if (space.kind === 'client') return ['client'];
  return canManage(r) ? ['member', 'guest'] : ['guest'];
}

/** D-25 with the power-level limit: nobody switches their own role, and nobody can demote an Owner. */
export function roleChoices(mine: Role | undefined, theirs: Role, self: boolean): ('owner' | 'admin' | 'member')[] {
  if (self || (theirs !== 'admin' && theirs !== 'member')) return [];
  if (mine === 'owner') return ['owner', 'admin', 'member'];
  if (mine === 'admin') return ['admin', 'member'];
  return [];
}

/** Channel names: lowercase, spaces become hyphens, 80 max. */
export function channelSlug(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, '-').slice(0, 80);
}
