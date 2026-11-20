// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { useEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider, type Message } from '../../matrix';
import { initI18n, setLanguage } from '../i18n';
import { createFakeStore, type FakeStoreOptions } from '../testing/fakeStore';
import { Composer } from './Composer';
import { ComposerProvider, useComposer, type ComposerContextValue } from './context';
import { MessageEditor } from './MessageEditor';

beforeAll(() => {
  initI18n();
});

afterEach(async () => {
  cleanup();
  await setLanguage('en');
});

const ref: { current: ComposerContextValue | null } = { current: null };
function Spy() {
  const value = useComposer();
  useEffect(() => {
    ref.current = value;
  });
  return null;
}
const ctx = () => ref.current!;

function mount(opts: FakeStoreOptions = {}) {
  const store = createFakeStore(opts);
  store.openTimeline('!general');
  render(
    <WorkspaceProvider store={store}>
      <ComposerProvider>
        <Spy />
        <Composer channelId="!general" channelName="general" />
      </ComposerProvider>
    </WorkspaceProvider>,
  );
  return store;
}

const box = () => screen.getByRole('textbox', { name: 'Message #general' });
const editorOf = (el: HTMLElement) => (el as HTMLElement & { editor: Editor }).editor;
const type = (text: string) => act(() => void editorOf(box()).commands.insertContent(text));
const enter = (init: KeyboardEventInit = {}) => fireEvent.keyDown(box(), { key: 'Enter', ...init });
const sendButton = () => screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement;
const file = (name: string, type = 'application/pdf', size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('Composer', () => {
  it('sends on Enter with the draft and clears; Shift+Enter adds a line', () => {
    const store = mount();
    const send = vi.spyOn(store, 'send');
    type('line one');
    enter({ shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    type('line two');
    enter();
    expect(send).toHaveBeenCalledExactlyOnceWith('!general', { body: 'line one\nline two', mentions: [] });
    expect(editorOf(box()).isEmpty).toBe(true);
  });

  it('ignores the Enter that confirms an IME composition', async () => {
    const store = mount();
    const send = vi.spyOn(store, 'send');
    type('にほんご');
    enter({ isComposing: true });
    enter({ keyCode: 229 });
    fireEvent.compositionEnd(box());
    enter();
    expect(send).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 150));
    enter();
    expect(send).toHaveBeenCalledWith('!general', { body: 'にほんご', mentions: [] });
  });

  it('does not send blank drafts; the send button sends formatted text', () => {
    const store = mount();
    const send = vi.spyOn(store, 'send');
    type('   ');
    enter();
    expect(sendButton().disabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
    act(() => void editorOf(box()).commands.setContent('<p><strong>Agenda</strong> for Thursday:</p><ul><li><p>Walkthrough</p></li></ul>'));
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sendButton());
    expect(send).toHaveBeenCalledWith('!general', {
      body: 'Agenda for Thursday:\n- Walkthrough',
      html: '<p><strong>Agenda</strong> for Thursday:</p><ul><li>Walkthrough</li></ul>',
      mentions: [],
    });
  });

  it('picks a mention from the list with the keyboard and sends it as a pill', async () => {
    const store = mount();
    const send = vi.spyOn(store, 'send');
    type('@in');
    const list = await screen.findByRole('listbox', { name: 'Mention someone' });
    expect(within(list).getByRole('option', { selected: true, name: 'Ingrid Holm' })).toBeTruthy();
    expect(within(list).queryByText('Sofia Olsen')).toBeNull();
    enter();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(send).not.toHaveBeenCalled();
    type('can you look?');
    enter();
    expect(send).toHaveBeenCalledWith('!general', {
      body: 'Ingrid Holm can you look?',
      html: '<a href="https://matrix.to/#/@ingrid:pasodrum.localhost">Ingrid Holm</a> can you look?',
      mentions: ['@ingrid:pasodrum.localhost'],
    });
  });

  it('blocks Send while an upload failed or is too large, until removed', () => {
    const store = mount();
    const send = vi.spyOn(store, 'send');
    act(() => store.attach('!general', [file('agenda-fail.pdf'), file('recording.mov', 'video/quicktime', 812 * 1024 * 1024)]));
    type('Recording and agenda');
    expect(screen.getByText('Upload failed')).toBeTruthy();
    expect(screen.getByText('Over 50 MB')).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    enter();
    expect(send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry agenda-fail.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove recording.mov' }));
    expect(sendButton().disabled).toBe(false);
    enter();
    expect(send).toHaveBeenCalledOnce();
    expect(store.getSnapshot().uploads['!general']).toEqual([]);
  });

  it('waits for uploads in progress, then sends', async () => {
    const store = mount({ uploadMs: 80 });
    const send = vi.spyOn(store, 'send');
    act(() => store.attach('!general', [file('agenda.pdf')]));
    expect(screen.getByRole('progressbar', { name: 'agenda.pdf' })).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
    type('Agenda');
    enter();
    expect(send).not.toHaveBeenCalled();
    await waitFor(() => expect(send).toHaveBeenCalledWith('!general', { body: 'Agenda', mentions: [] }));
  });

  it('attaches pasted files', () => {
    const store = mount();
    const attach = vi.spyOn(store, 'attach');
    const image = file('image.png', 'image/png');
    fireEvent.paste(box(), { clipboardData: { files: [image], getData: () => '', types: ['Files'] } });
    expect(attach).toHaveBeenCalledWith('!general', [image]);
  });

  it('replies: shows the bar, sends replyTo, and cancels', () => {
    const store = mount();
    const send = vi.spyOn(store, 'send');
    const target = store.getSnapshot().timelines['!general']!.messages.find((m) => m.body)!;
    act(() => ctx().startReply(target.id));
    expect(screen.getByText(target.body)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText(target.body)).toBeNull();
    act(() => ctx().startReply(target.id));
    type('Agreed');
    enter();
    expect(send).toHaveBeenCalledWith('!general', { body: 'Agreed', mentions: [], replyTo: target.id });
    expect(ctx().replyToId).toBeNull();
  });
});

describe('MessageEditor', () => {
  const own = (store: ReturnType<typeof createFakeStore>): Message => {
    const m: Message = { id: '$own', channelId: '!general', sender: store.getSnapshot().me, body: 'On it. One line of copy.', ts: Date.now(), status: 'sent' };
    store.set({ timelines: { '!general': { messages: [m], initialLoading: false, loadingOlder: false, hasOlder: false } } });
    return m;
  };
  function edit() {
    const store = createFakeStore();
    const message = own(store);
    const onDone = vi.fn();
    render(
      <WorkspaceProvider store={store}>
        <MessageEditor message={message} onDone={onDone} />
      </WorkspaceProvider>,
    );
    const field = screen.getByRole('textbox', { name: 'Edit message' });
    return { store, onDone, field, editor: editorOf(field) };
  }

  it('saves on Enter, not during IME composition', () => {
    const { store, onDone, field, editor } = edit();
    const save = vi.spyOn(store, 'edit');
    act(() => void editor.commands.insertContent(' Done.'));
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(save).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(save).toHaveBeenCalledWith('!general', '$own', { body: 'On it. One line of copy. Done.', mentions: [] });
    expect(onDone).toHaveBeenCalled();
  });

  it('cancels on Escape and with Cancel, without saving', () => {
    const { store, onDone, field } = edit();
    const save = vi.spyOn(store, 'edit');
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });

  it('asks to delete when saved empty', async () => {
    const { store, onDone, field, editor } = edit();
    const remove = vi.spyOn(store, 'remove');
    act(() => void editor.commands.clearContent());
    fireEvent.keyDown(field, { key: 'Enter' });
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete message?' });
    expect(within(dialog).getByText('On it. One line of copy.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledWith('!general', '$own');
    expect(onDone).toHaveBeenCalled();
  });
});
