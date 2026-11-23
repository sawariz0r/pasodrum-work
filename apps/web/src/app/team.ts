// Who is on the team (D-36): Owners, Admins and Staff. Clients and Externals never are.
import { useWorkspace, type Role, type Space, type WorkspaceSnapshot } from '../matrix';

export const isTeamRole = (r?: Role | string) => r === 'owner' || r === 'admin' || r === 'staff';

/** The workspace I'm on the team of (an unjoined client space can look like a workspace; my role there decides). */
export function teamWorkspace(s: WorkspaceSnapshot): Space | undefined {
  return s.spaces.find((x) => x.kind === 'workspace' && isTeamRole(s.myRoles[x.id]));
}

/** Owner, Admin or Staff in the workspace. */
export function useIsTeam(): boolean {
  return useWorkspace((x) => !!teamWorkspace(x));
}
