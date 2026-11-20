// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider, type Message, type Timeline } from '../../matrix';
import { createFakeStore } from '../testing/fakeStore';
import { initI18n, setLanguage } from '../i18n';
import { ChannelView } from './ChannelView';

beforeAll(() => {
  initI18n();
});

afterEach(async () => {
  cleanup();
  await setLanguage('en');
});

const jonas = { id: '@jonas:x', name: 'Jonas Berg' };
const ingrid = { id: '@ingrid:x', name: 'Ingrid Holm' };

function seeded(messages: Message[], extra: Partial<Timeline> = {}) {
  const store = createFakeStore();
  store.set({ timelines: { '!general': { messages, initialLoading: false, loadingOlder: false, hasOlder: false, ...extra } } });
  return store;
}

function mount(store = createFakeStore(), channelId = '!general') {
  render(
    <WorkspaceProvider store={store}>
      <ChannelView channelId={channelId} />
    </WorkspaceProvider>,
  );
  return store;
}

const composer = () => screen.getByRole('textbox', { name: 'Message #general' });

describe('ChannelView', () => {
  it('shows the loading skeleton, then the messages', async () => {
    mount(createFakeStore({ loadMs: 20 }));
    const scroller = document.querySelector('[aria-busy]')!;
    expect(scroller.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading')).toBeTruthy();
    await screen.findByText('Nordlys review moved to Thursday 14:00.');
    expect(scroller.getAttribute('aria-busy')).toBe('false');
  });

  it('groups messages by sender and shows a day divider in the viewer’s language', async () => {
    const now = Date.now();
    const store = seeded([
      { id: '1', channelId: '!general', sender: jonas, body: 'one', ts: now - 3 * 60_000, status: 'sent' },
      { id: '2', channelId: '!general', sender: jonas, body: 'two', ts: now - 2 * 60_000, status: 'sent' },
      { id: '3', channelId: '!general', sender: ingrid, body: 'three', ts: now - 60_000, status: 'sent' },
    ]);
    mount(store);
    const log = screen.getByRole('log');
    expect(within(log).getAllByText('Jonas Berg')).toHaveLength(1);
    expect(within(log).getAllByText('Ingrid Holm')).toHaveLength(1);
    expect(screen.getByRole('separator', { name: 'Today' })).toBeTruthy();

    await act(() => setLanguage('ja'));
    expect(screen.getByRole('separator', { name: '今日' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '#general へのメッセージ' }).getAttribute('placeholder')).toBe('#general へのメッセージ');
  });

  it('renders plain text safely: line breaks kept, URLs linked in a new tab, no HTML', () => {
    const body = '<b>bold</b>\nsee https://pasodrum.work/x.';
    mount(seeded([{ id: '1', channelId: '!general', sender: jonas, body, ts: Date.now(), status: 'sent' }]));
    const log = screen.getByRole('log');
    expect(log.querySelector('b')).toBeNull();
    const link = within(log).getByRole('link', { name: 'https://pasodrum.work/x' });
    expect(link.getAttribute('href')).toBe('https://pasodrum.work/x');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.parentElement!.textContent).toBe(body);
  });

  it('shows the empty state for a channel without messages', () => {
    mount(createFakeStore(), '!design');
    expect(screen.getByRole('heading', { name: '#design' })).toBeTruthy();
  });

  it('marks the channel read when open at the bottom', async () => {
    const store = createFakeStore();
    const markRead = vi.spyOn(store, 'markRead');
    mount(store, '!eng');
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('!eng'));
    expect(store.getSnapshot().channels['!pasodrum']!.find((c) => c.id === '!eng')!.unread).toBe(0);
  });

  it('asks for older history when there is more', () => {
    const store = seeded([{ id: '1', channelId: '!general', sender: jonas, body: 'one', ts: Date.now(), status: 'sent' }], { hasOlder: true });
    const loadOlder = vi.spyOn(store, 'loadOlder');
    mount(store);
    expect(loadOlder).toHaveBeenCalledWith('!general');
  });
});

describe('Composer', () => {
  it('sends on Enter, keeps Shift+Enter as a new line, and keeps focus', async () => {
    const store = mount();
    const send = vi.spyOn(store, 'sendText');
    const box = composer();
    expect(document.activeElement).toBe(box);

    fireEvent.change(box, { target: { value: 'line one' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: 'line one\nline two' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('!general', 'line one\nline two');
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(document.activeElement).toBe(box);
    expect(screen.getByRole('img', { name: 'Sending' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Sending' })).toBeNull());
  });

  it('ignores the Enter that confirms an IME composition', async () => {
    const store = mount();
    const send = vi.spyOn(store, 'sendText');
    const box = composer();
    fireEvent.change(box, { target: { value: 'にほんご' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });
    fireEvent.compositionEnd(box);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 150));
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('!general', 'にほんご');
  });

  it('does not send blank messages; the send button sends', () => {
    const store = mount();
    const send = vi.spyOn(store, 'sendText');
    const button = screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement;
    fireEvent.change(composer(), { target: { value: '   ' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(button.disabled).toBe(true);
    fireEvent.change(composer(), { target: { value: ' hi ' } });
    fireEvent.click(button);
    expect(send).toHaveBeenCalledExactlyOnceWith('!general', 'hi');
  });

  it('shows Not sent with Retry and Delete for a failed message', async () => {
    const store = mount();
    fireEvent.change(composer(), { target: { value: 'this will fail' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Not sent');

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(store.getSnapshot().timelines['!general']!.messages.at(-1)!.status).toBe('sent');

    fireEvent.change(composer(), { target: { value: 'fail again' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    const again = await screen.findByRole('alert');
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('fail again')).toBeNull();
  });
});
