// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider } from '../../matrix';
import { clearDraft, getDraft, setDraft } from '../drafts';
import { initI18n, setLanguage } from '../i18n';
import { ProfileCardContext } from '../people/ProfileCardContext';
import { createFakeStore, type FakeStoreOptions } from '../testing/fakeStore';
import { ChannelView } from '../timeline/ChannelView';

beforeAll(() => {
  initI18n();
});

const root = '$!general-1';

afterEach(async () => {
  cleanup();
  clearDraft('!general', root);
  clearDraft('!general');
  await setLanguage('en');
});

function Where() {
  return <output data-testid="search">{decodeURIComponent(useLocation().search)}</output>;
}

function mount({ thread, opts, open = () => {} }: { thread?: string; opts?: FakeStoreOptions; open?: (id: string, el: HTMLElement) => void } = {}) {
  const store = createFakeStore(opts);
  const view = (
    <MemoryRouter initialEntries={[thread ? `/c?thread=${encodeURIComponent(thread)}` : '/c']}>
      <WorkspaceProvider store={store}>
        <ProfileCardContext.Provider value={{ open }}>
          <ChannelView channelId="!general" />
          <Where />
        </ProfileCardContext.Provider>
      </WorkspaceProvider>
    </MemoryRouter>
  );
  const r = render(view);
  return { store, remount: () => (r.unmount(), render(view)) };
}

const panel = () => screen.getByRole('complementary', { name: 'Thread' });
const search = () => screen.getByTestId('search').textContent;
const replyBox = () => screen.getByRole('textbox', { name: 'Reply in thread' });
const editorOf = (el: HTMLElement) => (el as HTMLElement & { editor: Editor }).editor;
const typeInto = (el: HTMLElement, text: string) => act(() => void editorOf(el).commands.insertContent(text));

describe('Thread summary and opening', () => {
  it('shows count and participants under a root and opens the thread from it; Esc closes', async () => {
    mount();
    const summary = await screen.findByRole('button', { name: '4 replies' });
    expect(summary.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
    fireEvent.click(summary);
    expect(search()).toBe(`?thread=${root}`);
    const p = panel();
    expect(within(p).getByText('Nordlys review moved to Thursday 14:00.')).toBeTruthy();
    expect(within(p).getByText('4 replies')).toBeTruthy();
    expect(within(p).getByText('I’ll draft the welcome note they see the first time they open it.')).toBeTruthy();
    expect(within(p).queryByRole('button', { name: /replies/ })).toBeNull();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(search()).toBe('');
    expect(screen.queryByRole('complementary', { name: 'Thread' })).toBeNull();
  });

  it('opens from the hover bar Thread button; a new thread has no replies yet; Close closes', async () => {
    mount();
    const row = (await screen.findAllByText(/^Open question/))[0]!.closest('[data-message-id]') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Reply in thread' }));
    const p = panel();
    expect(within(p).getByText(/^Open question/)).toBeTruthy();
    expect(within(p).queryByText(/replies/)).toBeNull();
    expect(within(p).queryByRole('button', { name: 'Reply in thread' })).toBeNull();
    fireEvent.click(within(p).getByRole('button', { name: 'Close thread' }));
    expect(search()).toBe('');
  });

  it('opens from the URL, shows loading, then marks the thread read at the bottom', async () => {
    const { store } = mount({ thread: root, opts: { loadMs: 20 } });
    const read = vi.spyOn(store, 'markThreadRead');
    const p = panel();
    expect(within(p).getAllByText('Loading').length).toBeGreaterThan(0);
    await within(p).findByText('4 replies');
    await waitFor(() => expect(read).toHaveBeenCalledWith('!general', root));
  });

  it('shows Couldn’t load replies with Retry, which loads them', async () => {
    mount({ thread: root, opts: { threadFails: true } });
    const alert = within(panel()).getByRole('alert');
    expect(alert.textContent).toContain('Couldn’t load replies');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await within(panel()).findByText('4 replies')).toBeTruthy();
  });

  it('reads in Japanese', async () => {
    await setLanguage('ja');
    mount({ thread: root });
    expect(screen.getByRole('complementary', { name: 'スレッド' })).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'スレッド' })).getByText('4 件の返信')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'スレッドで返信' })).toBeTruthy();
  });
});

describe('Thread composer', () => {
  it('sends into the thread with threadRootId and updates the summary', async () => {
    const { store } = mount({ thread: root });
    const send = vi.spyOn(store, 'send');
    typeInto(replyBox(), 'Short and warm.');
    fireEvent.keyDown(replyBox(), { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('!general', expect.objectContaining({ body: 'Short and warm.', threadRootId: root }));
    expect(within(panel()).getByText('Short and warm.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '5 replies' })).toBeTruthy();
    expect(within(screen.getByRole('log', { name: '#general' })).queryByText('Short and warm.')).toBeNull();
  });

  it('does not send on an IME Enter', () => {
    const { store } = mount({ thread: root });
    const send = vi.spyOn(store, 'send');
    typeInto(replyBox(), 'へんしん');
    fireEvent.keyDown(replyBox(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(replyBox(), { key: 'Enter', keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps a draft per thread, restores it on return and clears it on send', async () => {
    const { remount } = mount({ thread: root });
    typeInto(replyBox(), 'Two lines, then a link.');
    await waitFor(() => expect(getDraft('!general', root)?.body).toBe('Two lines, then a link.'));
    expect(getDraft('!general')).toBeUndefined();

    remount();
    expect(editorOf(replyBox()).getText()).toBe('Two lines, then a link.');
    fireEvent.keyDown(replyBox(), { key: 'Enter' });
    expect(getDraft('!general', root)).toBeUndefined();
  });

  it('saves a draft typed just before leaving, and restores channel drafts too', () => {
    setDraft({ channelId: '!general', body: 'Channel draft', mentions: [] });
    const { remount } = mount({ thread: root });
    expect(editorOf(screen.getByRole('textbox', { name: 'Message #general' })).getText()).toBe('Channel draft');
    typeInto(replyBox(), 'Quick');
    remount();
    expect(getDraft('!general', root)?.body).toBe('Quick');
  });
});

describe('Profile hooks', () => {
  it('opens the profile card from a name and an avatar', async () => {
    const open = vi.fn();
    mount({ open });
    const row = (await screen.findAllByText(/^Only when the channel/))[0]!.closest('[data-message-id]') as HTMLElement;
    const name = within(row).getByRole('button', { name: 'Ingrid Holm' });
    fireEvent.click(name);
    expect(open).toHaveBeenCalledWith('@ingrid:pasodrum.localhost', name);
    fireEvent.click(row.querySelector('button[tabindex="-1"]')!);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
