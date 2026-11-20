// /dev/app: the real app on the fake store, for screenshots without a server.
// ?conn=starting|offline|reconnecting sets the first connection state; ?signin starts signed out.
// In the console, `fake.set({ connection: 'offline' })` changes the live store.
import { App } from '../app/App';
import type { ConnectionState } from '../matrix';
import { createFakeBackend } from './fakeBackend';

const q = new URLSearchParams(location.search);
const conn = q.get('conn');
const backend = createFakeBackend({
  signedIn: !q.has('signin'),
  connection: conn === 'starting' || conn === 'offline' || conn === 'reconnecting' ? (conn as ConnectionState) : 'online',
  delayMs: 400,
  loadMs: 600,
  uploadMs: 2400,
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
