// A Backend on the in-memory fake store, for /dev/app and tests. No server.
// Sign-in: a server address containing "down" can't be reached; the password "wrong" is wrong; anything else signs in.
import type { Backend } from '../app/backend';
import { createFakeStore, type FakeStoreOptions } from '../app/testing/fakeStore';
import { SignInError, type Session } from '../matrix';

export type FakeBackendOptions = FakeStoreOptions & { signedIn?: boolean; delayMs?: number };

const session: Session = { baseUrl: 'https://pasodrum.work', userId: '@sofia:pasodrum.work', deviceId: 'FAKE', accessToken: 'fake' };

export function createFakeBackend(opts: FakeBackendOptions = {}): Backend & { stores: ReturnType<typeof createFakeStore>[] } {
  let current: Session | null = opts.signedIn === false ? null : session;
  const wait = () => (opts.delayMs ? new Promise((r) => setTimeout(r, opts.delayMs)) : Promise.resolve());
  const stores: ReturnType<typeof createFakeStore>[] = [];
  return {
    stores,
    defaultServer: () => 'https://pasodrum.work',
    async resolveServer(input) {
      await wait();
      if (input.includes('down')) throw new SignInError('unreachable');
      return input.startsWith('http') ? input : `https://${input}`;
    },
    async signIn(baseUrl, identifier, password) {
      void identifier;
      await wait();
      if (password === 'wrong') throw new SignInError('wrong-password');
      current = { ...session, baseUrl };
      return current;
    },
    loadSession: () => current,
    createWorkspaceStore() {
      const store = createFakeStore(opts);
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
