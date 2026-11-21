// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackend } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { setDraft } from '../drafts';
import { initI18n, setLanguage } from '../i18n';

initI18n();

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

function renderApp(path: string) {
  const backend = createFakeBackend();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
      <Where />
    </MemoryRouter>,
  );
  return { store: () => backend.stores.at(-1)!, where: () => screen.getByTestId('where').textContent };
}

const flush = () => act(async () => {});
const rail = () => screen.getByRole('navigation', { name: 'Workspaces and sections' });
const sidebar = () => screen.getByRole('complementary', { name: 'Pasodrum navigation' });

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('navigation (D-23)', () => {
  it('shows Home, DMs and Activity on the rail with unread badges', () => {
    renderApp('/w/!pasodrum/c/!design');
    const home = within(rail()).getByRole('link', { name: 'Home' });
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(within(rail()).getByRole('link', { name: 'DMs, 1 unread' })).toBeTruthy();
    expect(within(rail()).getByRole('link', { name: 'Activity, 2 unread' })).toBeTruthy();
  });

  it('lists Threads, Drafts, channels and the space’s DMs in the sidebar; client spaces only on the rail', () => {
    renderApp('/w/!pasodrum/c/!design');
    const names = within(sidebar()).getAllByRole('link').map((l) => l.textContent);
    expect(names).toEqual(['Threads1', 'Drafts', 'design', 'eng', 'general', 'launch-site', 'lead2', 'JBJonas Berg1', 'IHIngrid Holm', '2Erik Kvam, Lea Aune', 'MLMaja Lind', 'TRTove Rask']);
    expect(within(sidebar()).queryByText('Henrik Dahl')).toBeNull();
    expect(within(sidebar()).getByRole('button', { name: 'Channels' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Channels' }));
    expect(within(sidebar()).queryByRole('link', { name: 'general' })).toBeNull();
  });

  it('opens a DM from the sidebar with the sidebar kept, and the DMs page with its list', async () => {
    const { where } = renderApp('/w/!pasodrum/c/!design');
    fireEvent.click(within(sidebar()).getByRole('link', { name: /Tove Rask/ }));
    expect(where()).toBe('/w/!pasodrum/dm/!dm-tove');
    expect(within(sidebar()).getByRole('link', { name: /Tove Rask/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1, name: /Tove Rask/ })).toBeTruthy();
    await flush();
    expect(screen.getByRole('heading', { level: 2, name: 'Tove Rask' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '#' })).toBeNull();

    fireEvent.click(within(rail()).getByRole('link', { name: /DMs/ }));
    expect(where()).toBe('/dms/!dm-jonas');
    const list = screen.getByRole('complementary', { name: 'Direct messages' });
    const rows = within(list).getAllByRole('link');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/dms/!dm-jonas', '/dms/!dm-henrik', '/dms/!dm-ingrid', '/dms/!dm-erik-lea', '/dms/!dm-maja', '/dms/!dm-tove']);
    expect(rows[0]!.getAttribute('aria-current')).toBe('page');
    expect(within(rows[1]!).getByText('Henrik Dahl')).toBeTruthy();
    expect(within(rail()).getByRole('link', { name: 'DMs' }).getAttribute('aria-current')).toBe('page');
  });

  it('shows threads in this space, unread first, and opens one beside the list', () => {
    const { where } = renderApp('/threads?space=!pasodrum');
    const cards = screen.getAllByRole('button').filter((b) => b.className.includes('card'));
    expect(cards.map((c) => c.querySelector('[class*="cardChannel"]')!.textContent)).toEqual(['general', 'eng', 'lead']);
    fireEvent.click(cards[1]!);
    expect(where()).toBe('/threads?space=%21pasodrum&thread=%24%21eng-sync');
    expect(cards[1]!.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('complementary', { name: 'Thread' })).toBeTruthy();
    cleanup();
    renderApp('/threads?space=!nordlys');
    expect(screen.getByRole('heading', { name: 'No threads yet' })).toBeTruthy();
  });
});

describe('activity', () => {
  it('filters, opens an item beside the list, marks it read and keeps the order', () => {
    const { store, where } = renderApp('/activity');
    const column = () => screen.getByRole('complementary', { name: 'Activity' });
    const rows = () => within(column()).getAllByRole('button').filter((b) => !b.getAttribute('role'));
    expect(rows()).toHaveLength(6);
    fireEvent.click(within(column()).getByRole('radio', { name: 'Replies' }));
    expect(rows().map((r) => r.querySelector('[class*="rowName"]')!.textContent)).toEqual(['Jonas Berg', 'Lea Aune']);
    fireEvent.click(within(column()).getByRole('radio', { name: 'Mentions' }));
    expect(rows()).toHaveLength(4);
    fireEvent.click(within(column()).getByRole('radio', { name: 'All' }));

    const before = rows().map((r) => r.textContent);
    fireEvent.click(rows()[0]!);
    expect(where()).toBe('/activity?item=a1');
    expect(store().getSnapshot().activity.find((a) => a.id === 'a1')!.unread).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: 'general' })).toBeTruthy();
    expect(rows()[0]!.getAttribute('aria-current')).toBe('true');
    expect(within(rail()).getByRole('link', { name: 'Activity, 1 unread' })).toBeTruthy();

    fireEvent.click(rows()[2]!);
    expect(where()).toBe('/activity?item=a3&thread=%24%21general-1');
    act(() => store().set({ activity: [...store().getSnapshot().activity].reverse() }));
    expect(rows().map((r) => r.textContent!.replace(/Unread/, ''))).toEqual(before.map((x) => x!.replace(/Unread/, '')));
  });

  it('shows Nothing new when empty', () => {
    const { store } = renderApp('/activity');
    act(() => store().set({ activity: [] }));
    expect(screen.getByRole('heading', { name: 'Nothing new' })).toBeTruthy();
  });
});

describe('drafts view', () => {
  it('lists this space’s drafts, opens one and deletes with a fade', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { where } = renderApp('/drafts?space=!pasodrum');
    expect(screen.getByRole('heading', { name: 'No drafts' })).toBeTruthy();
    const now = vi.spyOn(Date, 'now');
    act(() => {
      now.mockReturnValue(1000);
      setDraft({ channelId: '!eng', body: 'Works for me.', mentions: [] });
      now.mockReturnValue(2000);
      setDraft({ channelId: '!general', threadRootId: '$!general-1', body: 'Short and warm.', mentions: [] });
      now.mockReturnValue(3000);
      setDraft({ channelId: '!dm-jonas', body: 'Can we move our 1:1?', mentions: [] });
      setDraft({ channelId: '!questions', body: 'Elsewhere', mentions: [] });
    });
    now.mockRestore();
    const items = () => screen.getAllByRole('link').filter((l) => l.className.includes('draft'));
    expect(items().map((r) => r.querySelector('[class*="draftDest"]')!.textContent)).toEqual(['Jonas Berg', '#general', '#eng']);
    expect(within(sidebar()).getByRole('link', { name: /Drafts/ }).textContent).toBe('Drafts3');

    fireEvent.click(within(items()[2]!).getByRole('button', { name: 'Delete draft' }));
    expect(items()[2]!.className).toMatch(/leaving/);
    act(() => vi.advanceTimersByTime(200));
    expect(items()).toHaveLength(2);

    fireEvent.click(items()[1]!);
    expect(where()).toBe('/w/!pasodrum/c/!general?thread=%24!general-1');
  });
});

describe('new message', () => {
  it('reuses an existing DM, or opens a group DM', async () => {
    const { where, store } = renderApp('/w/!pasodrum/c/!design');
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'New message' }));
    await flush();
    const dialog = screen.getByRole('dialog', { name: 'New message' });
    expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(3);
    const send = within(dialog).getByRole('button', { name: 'Message' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const input = within(dialog).getByRole('combobox', { name: 'Name or email' });
    fireEvent.change(input, { target: { value: 'ing' } });
    await flush();
    expect(within(dialog).getAllByRole('option').map((o) => o.textContent)).toEqual(['IHIngrid Holm']);
    fireEvent.keyDown(input, { key: 'Enter', timeStamp: 10_000 });
    expect(within(dialog).getByRole('button', { name: 'Remove Ingrid Holm' })).toBeTruthy();
    const count = store().getSnapshot().dms.length;
    fireEvent.click(send);
    await flush();
    expect(where()).toBe('/dms/!dm-ingrid');
    expect(store().getSnapshot().dms).toHaveLength(count);

    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    await flush();
    const again = screen.getByRole('dialog', { name: 'New message' });
    const q = within(again).getByRole('combobox');
    fireEvent.change(q, { target: { value: 'jonas' } });
    await flush();
    fireEvent.click(within(again).getByRole('option', { name: /Jonas Berg/ }));
    fireEvent.change(q, { target: { value: 'tove' } });
    await flush();
    fireEvent.click(within(again).getByRole('option', { name: /Tove Rask/ }));
    fireEvent.keyDown(q, { key: 'Backspace' });
    expect(within(again).queryByRole('button', { name: 'Remove Tove Rask' })).toBeNull();
    fireEvent.change(q, { target: { value: 'tove' } });
    await flush();
    fireEvent.click(within(again).getByRole('option', { name: /Tove Rask/ }));
    fireEvent.click(within(again).getByRole('button', { name: 'Message' }));
    await flush();
    expect(store().getSnapshot().dms).toHaveLength(count + 1);
    expect(where()).toBe(`/dms/${store().getSnapshot().dms[0]!.id}`);
  });
});

describe('profile card', () => {
  it('shows local time from the time zone, work email and Message', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 20, 9, 14)));
    const { where } = renderApp('/w/!pasodrum/dm/!dm-tove');
    fireEvent.click(screen.getByRole('button', { name: /Tove Rask/ }));
    await flush();
    const card = screen.getByRole('dialog', { name: 'Profile: Tove Rask' });
    expect(within(card).getByText('10:14 · Stockholm')).toBeTruthy();
    expect(within(card).getByText('tove@pasodrum.work')).toBeTruthy();
    expect(card.textContent).not.toContain('@tove:');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    await setLanguage('ja');
    fireEvent.click(screen.getByRole('button', { name: /Tove Rask/ }));
    await flush();
    expect(within(screen.getByRole('dialog')).getByText('10:14・ストックホルム')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'メッセージ' }));
    await flush();
    expect(where()).toBe('/dms/!dm-tove');
  });
});

describe('Window800 rail pages', () => {
  it('shows the DM list alone, then the conversation with a way back', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('max-width: 800px'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const { where } = renderApp('/dms');
      expect(where()).toBe('/dms');
      expect(document.querySelector('.pane-list')).toBeTruthy();
      fireEvent.click(within(screen.getByRole('complementary', { name: 'Direct messages' })).getAllByRole('link')[2]!);
      expect(document.querySelector('.pane-detail')).toBeTruthy();
      fireEvent.click(screen.getByRole('link', { name: 'Back' }));
      expect(where()).toBe('/dms');
    } finally {
      window.matchMedia = real;
    }
  });
});
