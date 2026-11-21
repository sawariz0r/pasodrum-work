import {
  askForHelpByLink,
  claimInvite,
  confirmDevice,
  createWorkspaceStore,
  defaultServer,
  loadSession,
  previewConfirm,
  previewInvite,
  resolveServer,
  signIn,
  type ConfirmLink,
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
  /** D-38 confirm link page, before sign-in. Opening never confirms; rejects Error('unreachable'). */
  previewConfirm(code: string): Promise<ConfirmLink>;
  /** "Yes, it's me". Rejects Error('gone' | 'unreachable' | 'other'). */
  confirmDevice(code: string): Promise<void>;
  /** Tells the contact. Rejects Error('no-contact' | 'unreachable' | 'other'). */
  askForHelpByLink(code: string): Promise<void>;
}

export const matrixBackend: Backend = {
  defaultServer,
  resolveServer,
  signIn,
  loadSession,
  createWorkspaceStore,
  previewInvite,
  claimInvite,
  previewConfirm,
  confirmDevice,
  askForHelpByLink,
};
