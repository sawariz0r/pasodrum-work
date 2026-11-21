// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';

initI18n();

async function renderArchived(opts: FakeBackendOptions = {}, path = '/w/!nordlys/c/!questions') {
  const backend = createFakeBackend(opts);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
    </MemoryRouter>,
  );
  const store = backend.stores.at(-1)!;
  await act(() => store.setArchived('!nordlys', true));
  return store;
}

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(cleanup);

describe('archived client space (ArchivedSpace)', () => {
  it('replaces the composer with one quiet bar; clients get no Unarchive', async () => {
    await renderArchived({ perspective: 'client' });
    expect(screen.getByRole('status').textContent).toBe('Nordlys is archived');
    expect(screen.queryByRole('button', { name: 'Unarchive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('reads in Japanese', async () => {
    await setLanguage('ja');
    await renderArchived();
    expect(screen.getByRole('status').textContent).toContain('Nordlys はアーカイブ済みです');
    expect(screen.getByRole('button', { name: 'アーカイブを解除' })).toBeTruthy();
  });

  it('keeps only the actions that don’t write, and the thread panel gets the bar too', async () => {
    const store = await renderArchived({}, '/w/!nordlys/c/!questions?thread=%24q1');
    const me = store.getSnapshot().me;
    act(() =>
      store.set({
        timelines: {
          ...store.getSnapshot().timelines,
          '!questions': {
            initialLoading: false,
            loadingOlder: false,
            hasOlder: false,
            messages: [
              {
                id: '$q1', channelId: '!questions', sender: me, body: 'Sign-in screens are up.', ts: Date.now(), status: 'sent',
                reactions: [{ key: '👍', count: 1, mine: false, senders: [me] }],
              },
            ],
          },
        },
      }),
    );
    const main = screen.getByRole('main');
    expect(within(main).getByRole('button', { name: 'Reply in thread' })).toBeTruthy();
    expect(within(main).queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(within(main).queryByRole('button', { name: 'Add reaction' })).toBeNull();
    expect(within(main).getByRole('button', { name: /👍/ }).getAttribute('aria-disabled')).toBe('true');
    const thread = screen.getByRole('complementary', { name: 'Thread' });
    expect(within(thread).getByRole('status').textContent).toContain('Nordlys is archived');
    expect(thread.querySelector('[contenteditable="true"]')).toBeNull();
  });
});
