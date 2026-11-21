// A Backend on the in-memory fake store, for /dev/app and tests. No server.
// Sign-in: a server address containing "down" can't be reached; the password "wrong" is wrong, "busy" is rate limited,
// "oops" fails some other way; anything else signs in.
// Join links (/join/:code), with matrix/'s error codes: "used", "expired" (also any unknown code on the real service),
// "offline" (preview can't reach the service), "gone" (claim answers 410, then the link reads as used),
// "weak" (claim refuses the password), "down" (claim can't reach the service); any other code is an open link to Nordlys.
// Confirm links (/confirm/:code, D-38): "gone" (used, expired or replaced), "offline" (can't reach the service),
// "nohelp" (open, no contact: no pill); any other code is open, from Chrome on Mac in Tokyo, Jonas Berg helps.
import type { Backend } from '../app/backend';
import { createFakeStore, type FakeStoreOptions } from '../app/testing/fakeStore';
import { SignInError, type InvitePreview, type Session } from '../matrix';

export type FakeBackendOptions = FakeStoreOptions & { signedIn?: boolean; delayMs?: number };

const session: Session = { baseUrl: 'https://pasodrum.work', userId: '@sofia:pasodrum.work', deviceId: 'FAKE', accessToken: 'fake' };

const team = [
  { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' },
  { id: '@maja:pasodrum.localhost', name: 'Maja Lind' },
  { id: '@ingrid:pasodrum.localhost', name: 'Ingrid Holm' },
];

const henrik = { id: '@henrik_nordlys.no:pasodrum.work', name: 'Henrik Dahl', external: true, client: '!nordlys' };

export function createFakeBackend(opts: FakeBackendOptions = {}): Backend & { stores: ReturnType<typeof createFakeStore>[]; claims: { code: string; name: string }[] } {
  let current: Session | null = opts.signedIn === false ? null : session;
  const claims: { code: string; name: string }[] = [];
  const confirmed = new Set<string>();
  const wait = () => (opts.delayMs ? new Promise((r) => setTimeout(r, opts.delayMs)) : Promise.resolve());
  const stores: ReturnType<typeof createFakeStore>[] = [];
  return {
    stores,
    claims,
    async previewInvite(code) {
      await wait();
      if (code === 'offline') throw new Error('unreachable');
      const claimed = claims.some((c) => c.code === code);
      const state: InvitePreview['state'] = code === 'used' || claimed ? 'used' : code === 'expired' ? 'expired' : 'open';
      return { email: 'henrik@nordlys.no', spaceName: 'Nordlys', spaceKind: 'client', inviter: 'Jonas Berg', team, state };
    },
    async claimInvite(code, name) {
      await wait();
      if (code === 'down') throw new Error('unreachable');
      if (code === 'weak') throw new Error('weak-password');
      if (code === 'gone') {
        claims.push({ code, name });
        throw new Error('used');
      }
      claims.push({ code, name });
      return 'henrik@nordlys.no';
    },
    async previewConfirm(code) {
      await wait();
      if (code === 'offline') throw new Error('unreachable');
      if (code === 'gone' || confirmed.has(code)) return { state: 'gone', contact: 'Jonas Berg', contactId: '@jonas:pasodrum.localhost' };
      return { state: 'open', device: 'Chrome on Mac', requestedTs: Date.now() - 2 * 60_000, tz: 'Asia/Tokyo', ...(code !== 'nohelp' && { contact: 'Jonas Berg', contactId: '@jonas:pasodrum.localhost' }) };
    },
    async confirmDevice(code) {
      await wait();
      if (code === 'offline') throw new Error('unreachable');
      if (code === 'gone' || confirmed.has(code)) throw new Error('gone');
      confirmed.add(code);
    },
    async askForHelpByLink(code) {
      await wait();
      if (code === 'offline') throw new Error('unreachable');
      if (code === 'nohelp') throw new Error('no-contact');
    },
    defaultServer: () => 'https://pasodrum.work',
    async resolveServer(input) {
      await wait();
      if (input.includes('down')) throw new SignInError('unreachable');
      return input.startsWith('http') ? input : `https://${input}`;
    },
    async signIn(baseUrl, identifier, password) {
      await wait();
      if (password === 'wrong') throw new SignInError('wrong-password');
      if (password === 'busy') throw new SignInError('rate-limited');
      if (password === 'oops') throw new SignInError('other');
      current = { ...session, baseUrl, ...(identifier === 'henrik@nordlys.no' && { userId: henrik.id }) };
      return current;
    },
    loadSession: () => current,
    createWorkspaceStore(signed) {
      const store = createFakeStore(signed.userId === henrik.id ? { ...opts, me: henrik } : opts);
      const signOut = store.signOut;
      store.signOut = async () => {
        current = null;
        await signOut();
      };
      stores.push(store);
      return store;
    },
  };
}
