// Public surface of matrix/ (D-03). Signatures are the contract with app/ (D-19).
export * from './types';
export * from './docsBoardsTypes';
export { useDocsBoards } from './docsBoardsReact';
export { WorkspaceProvider, useStore, useWorkspace } from './react';
export { resolveServer, signIn, loadSession } from './session';
export { createWorkspaceStore } from './store';
export { previewInvite, claimInvite } from './invites';
export { previewConfirm, confirmDevice, askForHelpByLink, type ConfirmLink } from './confirm';
export { fold } from './search';
export { trimUrl } from './html';
export { findRefs } from './assistant';
export type { Answer, AskContext, AskError, Availability, Can, Depth, HistoryTurn, Lang, Looked, Part, Ref, Status } from './assistantWire';

/** Default server for this deployment: VITE_MATRIX_BASE in dev, otherwise this origin. */
export function defaultServer(): string {
  return import.meta.env.VITE_MATRIX_BASE ?? location.origin;
}
