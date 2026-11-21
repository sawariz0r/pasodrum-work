// /dev/app: the real app on the fake store, for screenshots without a server.
// ?conn=starting|offline|reconnecting sets the first connection state; ?signin starts signed out;
// ?role=owner|admin|staff|external sets my workspace role (M4; client spaces follow: external → none, otherwise the same).
// ?as=client|external signs in as the client (Henrik, Nordlys only) or an External (Ola: #design and Nordlys) (M5 shells, D-36).
// M6: ?security=unconfirmed (new device: DMs and #lead show the confirm card) | nodevice (no other device, recovery key only)
// | newkey (no recovery key yet: RecoveryKeySave on the first DM) · &password (the server asks for the password first)
// · ?confirm=asked|declined|timeout|mismatch|done starts on that confirmation step (asked = Is this you? from Safari on Mac)
// · ?security=elsewhere (open in another tab: Use here) · &unreadable (New key first asks for the current recovery key) · ?signout=last-device|no-backup (SignOutWarn / SignOutNoBackup). The recovery key is FAKE_RECOVERY_KEY; the password "wrong" is wrong.
// SIDE-03: ?confirm=person (Sofia asks to confirm it's you; use with ?as=client) · ?notready (Henrik hasn't set up again: Share → blocked).
// D-38: ?security=email signs in as the client (Henrik) on an unconfirmed device: DMs show Confirm it's you; Email me a link
// sends, and the link is tapped 8 s later (&notap: never; &nokey: nothing held, the help card; &other: another device is
// signed in; &nohelp: no contact pill) · ?help=email-missing|stuck|link-broken: a help card from Pasodrum in a DM (staff).
// In the console, `fake.set({ connection: 'offline' })` changes the live store.
import { App } from '../app/App';
import type { Confirmation, ConnectionState, HelpReason, Role, Security } from '../matrix';
import { createFakeBackend } from './fakeBackend';

const q = new URLSearchParams(location.search);
const conn = q.get('conn');
const role = q.get('role') as Role | null;
const as = q.get('as');
const sec = q.get('security');
const confirm = q.get('confirm') as Confirmation['phase'] | null;
const signout = q.get('signout');
const email = sec === 'email';
const help = q.get('help') as HelpReason | null;
const security: Partial<Security> = {
  ...(email && {
    device: 'unconfirmed',
    otherConfirmedDevices: q.has('other') ? 1 : 0,
    confirmByEmail: true,
    emailConfirm: { phase: 'idle', email: 'henrik@nordlys.no' },
    ...(!q.has('nohelp') && { helpContact: { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' } }),
  }),
  ...((sec === 'unconfirmed' || sec === 'nodevice') && { device: 'unconfirmed', otherConfirmedDevices: sec === 'nodevice' ? 0 : 2 }),
  ...(sec === 'newkey' && { needsRecoveryKey: true }),
  ...(sec === 'elsewhere' && { device: 'elsewhere' }),
  ...(confirm && {
    confirmation:
      confirm === 'asked'
        ? { role: 'approver', phase: 'asked', otherDevice: 'Safari on Mac' }
        : (confirm as string) === 'person'
          ? { role: 'person', phase: 'asked', person: { id: '@sofia:pasodrum.localhost', name: 'Sofia Olsen' } }
          : { role: 'new', phase: confirm, otherDevice: 'Chrome on Mac' },
  }),
};
const backend = createFakeBackend({
  signedIn: !q.has('signin'),
  connection: conn === 'starting' || conn === 'offline' || conn === 'reconnecting' ? (conn as ConnectionState) : 'online',
  delayMs: 400,
  loadMs: 600,
  uploadMs: 2400,
  ...(role && { roles: role === 'external' ? { '!pasodrum': 'external' } : { '!pasodrum': role, '!kumo': role, '!nordlys': role } }),
  ...((as === 'client' || as === 'external') && { perspective: as }),
  ...(email && { perspective: 'client' as const, ...(!q.has('notap') && { emailTapMs: 8000 }), ...(q.has('nokey') && { emailFails: 'no-key' as const }) }),
  ...((help === 'email-missing' || help === 'stuck' || help === 'link-broken') && { helpCard: help }),
  security,
  keyNeedsPassword: q.has('password'),
  backupUnreadable: q.has('unreadable'),
  ...(q.has('notready') && { notReadyPeople: ['@henrik_nordlys.no:pasodrum.localhost'] }),
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
