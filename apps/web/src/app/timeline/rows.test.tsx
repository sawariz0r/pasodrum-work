// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider, type Message, type Person } from '../../matrix';
import { ComposerProvider, useComposer } from '../composer/context';
import { initI18n, setLanguage } from '../i18n';
import { createFakeStore } from '../testing/fakeStore';
import { Timeline } from './Timeline';
import { TypingIndicator } from './TypingIndicator';

vi.mock('../composer/MessageEditor', () => ({
  MessageEditor: ({ message }: { message: Message }) => <div data-testid="editor">{message.body}</div>,
}));

beforeAll(() => {
  initI18n();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await setLanguage('en');
});

const me: Person = { id: '@sofia:x', name: 'Sofia Olsen' };
const jonas: Person = { id: '@jonas:x', name: 'Jonas Berg' };
const ingrid: Person = { id: '@ingrid:x', name: 'Ingrid Holm' };
const maja: Person = { id: '@maja:x', name: 'Maja Lind' };
const now = Date.now();
let n = 0;
const msg = (sender: Person, extra: Partial<Message> = {}): Message => ({
  id: `$${++n}`, channelId: '!c', sender, body: 'hello', ts: now - 60_000 + n * 1000, status: 'sent', ...extra,
});
const img = (sender: Person, name: string, extra: Partial<Message> = {}) =>
  msg(sender, { kind: 'image', body: '', media: { ref: `mxc://t/${name}`, name, width: 1200, height: 800 }, ...extra });

function ComposerProbe() {
  const c = useComposer();
  return <div data-testid="composer">{`reply:${c.replyToId ?? ''} edit:${c.editingId ?? ''}`}</div>;
}

function mount(messages: Message[], opts: { unreadAtOpen?: number; typing?: Person[] } = {}) {
  const store = createFakeStore({ me });
  store.set({
    timelines: { '!c': { messages, initialLoading: false, loadingOlder: false, hasOlder: false } },
    typing: opts.typing ? { '!c': opts.typing } : {},
  });
  const ui = (
    <WorkspaceProvider store={store}>
      <ComposerProvider>
        <Timeline channelId="!c" channelName="c" timeline={store.getSnapshot().timelines['!c']} meId={me.id} unreadAtOpen={opts.unreadAtOpen} />
        <TypingIndicator channelId="!c" />
        <ComposerProbe />
      </ComposerProvider>
    </WorkspaceProvider>
  );
  const view = render(ui);
  const update = (next: Message[]) => {
    store.set({ timelines: { '!c': { messages: next, initialLoading: false, loadingOlder: false, hasOlder: false } } });
    view.rerender(
      <WorkspaceProvider store={store}>
        <ComposerProvider>
          <Timeline channelId="!c" channelName="c" timeline={store.getSnapshot().timelines['!c']} meId={me.id} unreadAtOpen={opts.unreadAtOpen} />
          <ComposerProbe />
        </ComposerProvider>
      </WorkspaceProvider>,
    );
  };
  return { store, update };
}

const rowOf = (text: string) => screen.getByText(text).closest<HTMLElement>('[data-message-id]')!;

describe('formatted text', () => {
  it('renders the allow-listed HTML as elements, mentions as pills and links in a new tab', () => {
    mount([
      msg(maja, {
        body: 'rules',
        html: '<p>Composer rules, <strong>final</strong>:</p><ol><li><code>Shift</code> + Enter</li></ol><blockquote>One line.</blockquote><pre><code>let a = 1;\n</code></pre><p>See <a href="https://pasodrum.work/spec">spec</a> <a href="javascript:alert(1)">bad</a> <a href="https://matrix.to/#/@sofia:x" data-mention="@sofia:x">Sofia Olsen</a><img src="x" onerror="alert(1)"></p>',
      }),
    ]);
    const log = screen.getByRole('log');
    expect(within(log).getByText('final').tagName).toBe('STRONG');
    expect(within(log).getByText('Shift').tagName).toBe('CODE');
    expect(log.querySelector('ol > li')).toBeTruthy();
    expect(log.querySelector('blockquote')!.textContent).toBe('One line.');
    expect(log.querySelector('pre code')!.textContent).toBe('let a = 1;');
    expect(within(log).getByRole('button', { name: 'Copy code' })).toBeTruthy();
    const link = within(log).getByRole('link', { name: 'spec' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(within(log).queryByRole('link', { name: 'bad' })).toBeNull();
    expect(within(log).getByText('@Sofia Olsen').getAttribute('data-mention')).toBe('@sofia:x');
    expect(log.querySelector('img, script, [onerror]')).toBeNull();
  });

  it('marks edits after the last word and highlights mentions of me', () => {
    mount([msg(jonas, { body: 'Open question', edited: true, mentionsMe: true })]);
    const row = rowOf('Open question');
    expect(row.textContent).toContain('Open question (edited)');
    expect(row.className).toMatch(/mention/);
  });
});

describe('quiet rows', () => {
  it('shows deleted, unsupported and system rows in the viewer’s language', async () => {
    mount([
      msg(jonas, { kind: 'deleted', body: '' }),
      msg(ingrid, { kind: 'unsupported', body: 'Where should the offsite be?' }),
      msg(ingrid, { kind: 'unsupported', body: '' }),
      msg(jonas, { kind: 'system', body: '', system: { joined: [maja, ingrid, jonas], left: [] } }),
    ]);
    expect(screen.getByText('Message deleted')).toBeTruthy();
    expect(screen.getByText('Where should the offsite be?')).toBeTruthy();
    expect(screen.getByText('This message can’t be shown')).toBeTruthy();
    expect(screen.getByText('Maja Lind, Ingrid Holm and Jonas Berg joined')).toBeTruthy();
    await act(() => setLanguage('ja'));
    expect(screen.getByText('メッセージは削除されました')).toBeTruthy();
    expect(screen.getByText('このメッセージは表示できません')).toBeTruthy();
    expect(screen.getByText('Maja Lindさん、Ingrid Holmさん、Jonas Bergさんが参加しました')).toBeTruthy();
  });
});

describe('replies', () => {
  it('jumps to a loaded original and flashes it; a fallback quote is not clickable', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const q = msg(jonas, { body: 'Should guests see history?' });
    mount([
      q,
      msg(ingrid, { body: 'Only from day one.', replyTo: { id: q.id, sender: jonas, body: q.body, found: true } }),
      msg(maja, { body: 'Same here.', replyTo: { id: '$gone', sender: ingrid, body: 'Staging is green.', found: false } }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Jonas Berg.*Should guests see history\?/ }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getAllByText('Should guests see history?')[0]!.closest('[data-message-id]')!.className).toMatch(/flash/);
    const fallback = screen.getByText('Staging is green.');
    expect(fallback.closest('button')).toBeNull();
  });
});

describe('media', () => {
  it('shows aspect-correct placeholders, then the image; several images make a grid with +N', async () => {
    const mediaUrl = vi.fn((ref: string) => Promise.resolve(`blob:${ref}`));
    const { store } = mount([
      msg(ingrid, { body: 'Photos' }),
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((x) => img(ingrid, `${x}.jpg`)),
      img(jonas, 'header.jpg', { media: { ref: 'mxc://t/header', name: 'header.jpg', width: 1440, height: 808 } }),
    ]);
    store.mediaUrl = mediaUrl;
    const single = screen.getByRole('button', { name: 'Open header.jpg' });
    expect(single.style.width).toBe('360px');
    expect(single.style.height).toBe('202px');
    expect(screen.getAllByRole('button', { name: /Open image \d of 6/ })).toHaveLength(4);
    expect(screen.getByText('+2')).toBeTruthy();
    await waitFor(() => expect(single.querySelector('img')).toBeTruthy());
  });

  it('renders file cards with size and download, video with play, audio with play', () => {
    mount([
      msg(jonas, { body: 'Everything for Thursday:' }),
      msg(jonas, { kind: 'file', body: '', media: { ref: 'mxc://t/1', name: 'agenda.docx', size: 86_000 } }),
      msg(jonas, { kind: 'file', body: '', media: { ref: 'mxc://t/2', name: 'brand.zip', size: 64_900_000 } }),
      msg(ingrid, { kind: 'video', body: '', media: { ref: 'mxc://t/3', name: 'rec.mov', durationMs: 42_000 } }),
      msg(maja, { kind: 'audio', body: 'Interview', media: { ref: 'mxc://t/4', name: 'interview.m4a', durationMs: 728_000 } }),
    ]);
    expect(screen.getByText('86 KB')).toBeTruthy();
    expect(screen.getByText('64.9 MB')).toBeTruthy();
    expect(screen.getByText('DOCX')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download agenda.docx' })).toBeTruthy();
    expect(rowOf('agenda.docx')).toBe(rowOf('brand.zip'));
    expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy();
    expect(screen.getByText('0:42')).toBeTruthy();
    expect(screen.getByText('Interview')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('12:08')).toBeTruthy();
  });
});

describe('image viewer', () => {
  it('opens on the clicked image, moves with arrow keys and closes with Escape', async () => {
    mount([img(ingrid, 'one.jpg'), msg(maja, { body: 'between' }), img(jonas, 'two.jpg')]);
    fireEvent.click(screen.getByRole('button', { name: 'Open one.jpg' }));
    const viewer = await screen.findByRole('dialog', { name: 'Image from Ingrid Holm' });
    expect(within(viewer).queryByRole('button', { name: 'Previous image' })).toBeNull();
    fireEvent.keyDown(viewer, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Image from Jonas Berg' })).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Download' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'Image from Ingrid Holm' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('reactions', () => {
  it('shows mine, toggles on click and names who reacted after a pause', () => {
    vi.useFakeTimers();
    const m = msg(jonas, {
      body: 'Morning!',
      reactions: [
        { key: '🎉', count: 24, mine: true, senders: [jonas, maja, me] },
        { key: '🙌', count: 1, mine: false, senders: [ingrid] },
      ],
    });
    const { store } = mount([m]);
    const react = vi.spyOn(store, 'react');
    const unreact = vi.spyOn(store, 'unreact');
    const party = screen.getByRole('button', { name: '🎉 24, including you' });
    expect(party.getAttribute('aria-pressed')).toBe('true');
    fireEvent.mouseEnter(party.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip').textContent).toBe('🎉Jonas Berg, Maja Lind, you and 21 others');
    fireEvent.click(party);
    expect(unreact).toHaveBeenCalledWith('!c', m.id, '🎉');
    fireEvent.click(screen.getByRole('button', { name: '🙌 1' }));
    expect(react).toHaveBeenCalledWith('!c', m.id, '🙌');
  });
});

describe('actions', () => {
  const openMore = (row: HTMLElement) => {
    const more = within(row).getByRole('button', { name: 'More actions' });
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    return screen.getByRole('menu');
  };

  it('Reply and Edit go to the composer; others’ messages offer only copy', () => {
    mount([msg(jonas, { body: 'Theirs' }), msg(me, { body: 'Mine' })]);
    fireEvent.click(within(rowOf('Theirs')).getByRole('button', { name: 'Reply' }));
    expect(screen.getByTestId('composer').textContent).toBe(`reply:${rowOf('Theirs').dataset.messageId} edit:`);

    const theirs = openMore(rowOf('Theirs'));
    expect(within(theirs).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy text', 'Copy link']);
    fireEvent.keyDown(theirs, { key: 'Escape' });

    const mine = openMore(rowOf('Mine'));
    expect(within(mine).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Copy text', 'Copy link', 'Delete']);
    const id = rowOf('Mine').dataset.messageId;
    fireEvent.click(within(mine).getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByTestId('composer').textContent).toBe(`reply:${rowOf('Theirs').dataset.messageId} edit:${id}`);
    expect(screen.getByTestId('editor').closest('[data-message-id]')!.className).toMatch(/editing/);
  });

  it('Delete confirms first; Copy link shows a toast', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { store } = mount([msg(me, { body: 'Mine' })]);
    const remove = vi.spyOn(store, 'remove');
    const id = rowOf('Mine').dataset.messageId!;

    fireEvent.click(within(openMore(rowOf('Mine'))).getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(store.messageLink('!c', id));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Link copied');

    fireEvent.click(within(openMore(rowOf('Mine'))).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledWith('!c', id);
  });
});

describe('new messages', () => {
  it('puts the New line above the first unread when opened', () => {
    mount([msg(jonas, { body: 'read' }), msg(me, { body: 'mine' }), msg(ingrid, { body: 'first new' }), msg(maja, { body: 'second new' })], { unreadAtOpen: 2 });
    const line = screen.getByRole('separator', { name: 'New messages' });
    expect(line.nextElementSibling).toBe(rowOf('first new'));
  });

  it('shows Jump to latest with the count when new messages arrive while scrolled up', () => {
    const first = [msg(jonas, { body: 'one' }), msg(ingrid, { body: 'two' })];
    const { update } = mount(first);
    const scroller = document.querySelector<HTMLElement>('[aria-busy]')!;
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    update([...first, msg(maja, { body: 'three' }), msg(jonas, { body: 'four' })]);
    const pill = screen.getByRole('button', { name: 'Jump to latest, 2 new' });
    expect(pill.textContent).toBe('2 new messages');
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as typeof scroller.scrollTo;
    fireEvent.click(pill);
    expect(scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
  });

  it('shows who is typing', async () => {
    mount([msg(jonas)], { typing: [jonas] });
    expect(screen.getByRole('status').textContent).toBe('Jonas Berg is typing…');
    await act(() => setLanguage('ja'));
    expect(screen.getByRole('status').textContent).toBe('Jonas Bergさんが入力中…');
  });
});
