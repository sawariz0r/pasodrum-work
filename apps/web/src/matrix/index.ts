// Public surface of matrix/ (D-03). Implementation lands in M1-04; signatures are the contract with app/.
import type { Session, WorkspaceStore } from './types';

export * from './types';
export { WorkspaceProvider, useStore, useWorkspace } from './react';

/** Default server for this deployment: VITE_MATRIX_BASE in dev, otherwise this origin. */
export function defaultServer(): string {
  return import.meta.env.VITE_MATRIX_BASE ?? location.origin;
}

/** Turns what a person typed ("pasodrum.work", "https://…") into a base URL via .well-known. Throws SignInError('unreachable'). */
export async function resolveServer(input: string): Promise<string> {
  void input;
  throw new Error('M1-04');
}

/** identifier: work email or username. Throws SignInError. */
export async function signIn(baseUrl: string, identifier: string, password: string): Promise<Session> {
  void baseUrl; void identifier; void password;
  throw new Error('M1-04');
}

export function loadSession(): Session | null {
  return null;
}

export function createWorkspaceStore(session: Session): WorkspaceStore {
  void session;
  throw new Error('M1-04');
}
