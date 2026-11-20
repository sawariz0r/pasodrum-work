import {
  claimInvite,
  createWorkspaceStore,
  defaultServer,
  loadSession,
  previewInvite,
  resolveServer,
  signIn,
  type InvitePreview,
  type Session,
  type WorkspaceStore,
} from '../matrix';

/** The matrix/ entry points the app needs (D-19). The dev screens and tests pass a fake one. */
export interface Backend {
  defaultServer(): string;
  resolveServer(input: string): Promise<string>;
  signIn(baseUrl: string, identifier: string, password: string): Promise<Session>;
  loadSession(): Session | null;
  createWorkspaceStore(session: Session): WorkspaceStore;
  /** M4 join page, before sign-in (D-26). */
  previewInvite(code: string): Promise<InvitePreview>;
  /** Resolves to the identifier to sign in with. Used or expired links reject (410). */
  claimInvite(code: string, name: string, password: string): Promise<string>;
}

export const matrixBackend: Backend = { defaultServer, resolveServer, signIn, loadSession, createWorkspaceStore, previewInvite, claimInvite };
