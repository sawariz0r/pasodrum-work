// Pre-sign-in calls to the invite service (D-26), same origin under /api/invites. Implemented in M4-02.
import type { InvitePreview } from './types';

export async function previewInvite(code: string): Promise<InvitePreview> {
  void code;
  throw new Error('M4');
}

/** Sets name + password for the invited account; resolves to the identifier to sign in with. */
export async function claimInvite(code: string, name: string, password: string): Promise<string> {
  void code; void name; void password;
  throw new Error('M4');
}
