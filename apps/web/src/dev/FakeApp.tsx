// /dev/app: the real app on the fake store, for screenshots without a server.
// ?conn=starting|offline|reconnecting sets the first connection state; ?signin starts signed out;
// ?role=owner|admin|member|guest sets my workspace role (M4; Nordlys follows: guest → none, otherwise the same).
// ?as=client|guest signs in as the client (Henrik, Nordlys only) or a guest (Ola) (M5 shells).
// In the console, `fake.set({ connection: 'offline' })` changes the live store.
import { App } from '../app/App';
import type { ConnectionState, Role } from '../matrix';
import { createFakeBackend } from './fakeBackend';

const q = new URLSearchParams(location.search);
const conn = q.get('conn');
const role = q.get('role') as Role | null;
const as = q.get('as');
const backend = createFakeBackend({
  signedIn: !q.has('signin'),
  connection: conn === 'starting' || conn === 'offline' || conn === 'reconnecting' ? (conn as ConnectionState) : 'online',
  delayMs: 400,
  loadMs: 600,
  uploadMs: 2400,
  ...(role && { roles: role === 'guest' ? { '!pasodrum': 'guest' } : { '!pasodrum': role, '!nordlys': role } }),
  ...((as === 'client' || as === 'guest') && { perspective: as }),
});

const create = backend.createWorkspaceStore;
backend.createWorkspaceStore = (session) => {
  const store = create(session);
  Object.assign(window, { fake: store });
  return store;
};

export default function FakeApp() {
  return <App backend={backend} basename="/dev/app" />;
}
