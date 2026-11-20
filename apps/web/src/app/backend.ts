import { createWorkspaceStore, defaultServer, loadSession, resolveServer, signIn, type Session, type WorkspaceStore } from '../matrix';

/** The matrix/ entry points the app needs (D-19). The dev screens and tests pass a fake one. */
export interface Backend {
  defaultServer(): string;
  resolveServer(input: string): Promise<string>;
  signIn(baseUrl: string, identifier: string, password: string): Promise<Session>;
  loadSession(): Session | null;
  createWorkspaceStore(session: Session): WorkspaceStore;
}

export const matrixBackend: Backend = { defaultServer, resolveServer, signIn, loadSession, createWorkspaceStore };
