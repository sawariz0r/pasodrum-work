// Any sign-out or session expiry (App.tsx calls notifySignedOut). State held in memory outside React subscribes and clears itself:
// translations, the Assistant's conversation, the right panel.
const listeners = new Set<() => void>();

export function onSignedOut(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function notifySignedOut() {
  listeners.forEach((f) => f());
}
