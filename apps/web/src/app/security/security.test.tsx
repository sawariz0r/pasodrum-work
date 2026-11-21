// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import type { WorkspaceStore } from '../../matrix';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';
import { FAKE_RECOVERY_KEY } from '../testing/fakeStore';

initI18n();

function renderApp(path: string, opts: FakeBackendOptions = {}, patch?: (store: WorkspaceStore) => void) {
  const backend = createFakeBackend({ security: { device: 'unconfirmed', otherConfirmedDevices: 2 }, ...opts });
  if (patch) {
    const create = backend.createWorkspaceStore;
    backend.createWorkspaceStore = (session) => {
      const store = create(session);
      patch(store);
      return store;
    };
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
    </MemoryRouter>,
  );
  return { store: () => backend.stores.at(-1)! };
}

const flush = () => act(async () => {});
const gate = () => screen.queryByRole('group', { name: 'Confirm this device' });
const keyCard = () => screen.queryByRole('group', { name: 'Save your recovery key', hidden: true });
const composer = () => screen.queryByRole('textbox', { name: /Message/, hidden: true });
const noKeyYet: FakeBackendOptions = { security: { device: 'confirmed', otherConfirmedDevices: 0, needsRecoveryKey: true } };

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(() => cleanup());

describe('confirm this device (D-11, D-31)', () => {
  it('shows the confirm card instead of encrypted DMs and private channels on an unconfirmed device', async () => {
    renderApp('/dms/!dm-jonas');
    await flush();
    expect(gate()).toBeTruthy();
    expect(screen.queryByText('Can you look at the client welcome copy today?')).toBeNull();
    expect(composer()).toBeNull();
    cleanup();

    renderApp('/w/!pasodrum/c/!lead', { security: { device: 'unconfirmed', otherConfirmedDevices: 0 } });
    await flush();
    expect(within(gate()!).queryByRole('button', { name: 'Use another device' })).toBeNull();
    expect(within(gate()!).getByRole('button', { name: 'Use recovery key' })).toBeTruthy();
  });

  it('never asks in public workspace channels or client-space channels', async () => {
    for (const path of ['/w/!pasodrum/c/!general', '/w/!nordlys/c/!project-updates']) {
      renderApp(path);
      await flush();
      expect(gate()).toBeNull();
      cleanup();
    }
  });

  it('gates the Threads view panel, and shows no text of encrypted conversations in lists', async () => {
    renderApp('/threads?space=!pasodrum&thread=$!lead-q1');
    await flush();
    const panel = screen.getByRole('complementary', { name: 'Thread' });
    expect(within(panel).getByRole('group', { name: 'Confirm this device' })).toBeTruthy();
    expect(within(panel).queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/Q1 planning doc is up/)).toBeNull();
    expect(screen.queryByText('Added ours. Hiring is the big one.')).toBeNull();
    cleanup();

    renderApp('/activity');
    await flush();
    expect(screen.queryByText(/Q1 planning doc is up/)).toBeNull();
    expect(screen.getByText(/the invite email template is ready/)).toBeTruthy();
    cleanup();

    const { store } = renderApp('/dms');
    await flush();
    store().openTimeline('!dm-jonas');
    await flush();
    expect(screen.queryByText('Got a minute before the Nordlys call?')).toBeNull();
  });

  it('accepts the recovery key with spaces, dashes and full-width characters, case-sensitive; a wrong key keeps its text', async () => {
    const { store } = renderApp('/dms/!dm-jonas');
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Use recovery key' }));
    const field = await screen.findByRole('textbox', { name: 'Recovery key' });
    const confirm = async (value: string) => {
      fireEvent.change(field, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await flush();
    };

    await confirm(FAKE_RECOVERY_KEY.toLowerCase());
    expect(screen.getByRole('alert').textContent).toBe('That recovery key isn’t right');
    expect((field as HTMLTextAreaElement).value).toBe(FAKE_RECOVERY_KEY.toLowerCase());
    expect(store().getSnapshot().security.device).toBe('unconfirmed');

    const fullWidth = (x: string) => x.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
    await confirm(`  ${fullWidth(FAKE_RECOVERY_KEY.slice(0, 9))}-${FAKE_RECOVERY_KEY.slice(9).replace(/ /g, '　')}\n`);
    expect(store().getSnapshot().security.device).toBe('confirmed');
    expect(gate()).toBeNull();
  });
});

describe('the first recovery key comes before the first private message (RulesM6)', () => {
  it('keeps the composer away until the key is saved', async () => {
    renderApp('/dms/!dm-jonas', noKeyYet);
    await flush();
    expect(screen.getByRole('dialog', { name: 'Save your recovery key' })).toBeTruthy();
    expect(keyCard()).toBeTruthy();
    expect(composer()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'I’ve saved it' }));
    await flush();
    expect(keyCard()).toBeNull();
    expect(composer()).toBeTruthy();
  });

  it('keeps it away after Cancel on the password step, and after a failure (with Retry)', async () => {
    renderApp('/dms/!dm-jonas', { ...noKeyYet, keyNeedsPassword: true });
    await flush();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Enter your password' })).getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(keyCard()).toBeTruthy();
    expect(composer()).toBeNull();
    cleanup();

    let fail = true;
    renderApp('/dms/!dm-jonas', noKeyYet, (store) => {
      const make = store.newRecoveryKey.bind(store);
      store.newRecoveryKey = (password) => (fail ? Promise.reject(new Error('network')) : make(password));
    });
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t make a recovery key');
    expect(composer()).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.getByRole('dialog', { name: 'Save your recovery key' })).toBeTruthy();
    expect(composer()).toBeNull();
  });
});

describe('share earlier messages (SIDE-03, D-35)', () => {
  const cardButtons = async (path: string, opts: FakeBackendOptions) => {
    renderApp(path, { security: { device: 'confirmed', otherConfirmedDevices: 1 }, ...opts });
    await flush();
    fireEvent.click(document.querySelector<HTMLButtonElement>('h1 button')!);
    await flush();
    const card = screen.getByRole('dialog', { name: /profile/i });
    const names = within(card).queryAllByRole('button').map((b) => b.textContent);
    cleanup();
    return names;
  };

  it('is offered only to team people, in a 1:1 DM with an outside person', async () => {
    expect(await cardButtons('/dms/!dm-henrik', {})).toEqual(['Share earlier messages']);
    expect(await cardButtons('/dms/!dm-henrik', { roles: { '!pasodrum': 'member' } })).toEqual(['Share earlier messages']);
    expect(await cardButtons('/dms/!dm-jonas', {})).toEqual(['Message']);
    expect(await cardButtons('/dms/!dm-henrik', { perspective: 'client' })).toEqual(['Message']);
    expect(await cardButtons('/dms/!dm-henrik', { roles: { '!pasodrum': 'guest' } })).toEqual(['Message']);
  });
});
