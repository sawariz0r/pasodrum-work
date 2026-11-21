// /dev/app: the real app on the fake store, for screenshots without a server.
// ?conn=starting|offline|reconnecting sets the first connection state; ?signin starts signed out;
// ?role=owner|admin|member|guest sets my workspace role (M4; Nordlys follows: guest → none, otherwise the same).
// ?as=client|guest signs in as the client (Henrik, Nordlys only) or a guest (Ola) (M5 shells).
// M6: ?security=unconfirmed (new device: DMs and #lead show the confirm card) | nodevice (no other device, recovery key only)
// | newkey (no recovery key yet: RecoveryKeySave on the first DM) · &password (the server asks for the password first)
// · ?confirm=asked|declined|timeout|mismatch|done starts on that confirmation step (asked = Is this you? from Safari on Mac)
// · ?security=elsewhere (open in another tab: Use here) · &unreadable (New key first asks for the current recovery key) · ?signout=last-device|no-backup (SignOutWarn / SignOutNoBackup). The recovery key is FAKE_RECOVERY_KEY; the password "wrong" is wrong.
// In the console, `fake.set({ connection: 'offline' })` changes the live store.
import { App } from '../app/App';
import type { Confirmation, ConnectionState, Role, Security } from '../matrix';
import { createFakeBackend } from './fakeBackend';

const q = new URLSearchParams(location.search);
const conn = q.get('conn');
const role = q.get('role') as Role | null;
const as = q.get('as');
const sec = q.get('security');
const confirm = q.get('confirm') as Confirmation['phase'] | null;
const signout = q.get('signout');
const security: Partial<Security> = {
  ...((sec === 'unconfirmed' || sec === 'nodevice') && { device: 'unconfirmed', otherConfirmedDevices: sec === 'nodevice' ? 0 : 2 }),
  ...(sec === 'newkey' && { needsRecoveryKey: true }),
  ...(sec === 'elsewhere' && { device: 'elsewhere' }),
  ...(confirm && {
    confirmation:
      confirm === 'asked' ? { role: 'approver', phase: 'asked', otherDevice: 'Safari on Mac' } : { role: 'new', phase: confirm, otherDevice: 'Chrome on Mac' },
  }),
};
const backend = createFakeBackend({
  signedIn: !q.has('signin'),
  connection: conn === 'starting' || conn === 'offline' || conn === 'reconnecting' ? (conn as ConnectionState) : 'online',
  delayMs: 400,
  loadMs: 600,
  uploadMs: 2400,
  ...(role && { roles: role === 'guest' ? { '!pasodrum': 'guest' } : { '!pasodrum': role, '!nordlys': role } }),
  ...((as === 'client' || as === 'guest') && { perspective: as }),
  security,
  keyNeedsPassword: q.has('password'),
  backupUnreadable: q.has('unreadable'),
  ...((signout === 'last-device' || signout === 'no-backup') && { signOutRisk: signout }),
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
