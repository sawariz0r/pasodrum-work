// The channel and thread composer (ComposerFormat, ComposerReply, EmojiPicker, MentionPicker, LinkDialog, Upload*, DropOverlay, ThreadComposer boards).
// Unsent text is kept per channel and per thread on this device (app/drafts.ts).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useStore, useWorkspace, type Draft, type Person, type Upload, type WorkspaceSnapshot, type WorkspaceStore } from '../../matrix';
import { clearDraft, getDraft, setDraft, useDraftsFor } from '../drafts';
import { isImeEnter } from '../../ui';
import { useComposer } from './context';
import { editableContent, toDraft } from './draft';
import { EmojiPicker } from './EmojiPicker';
import type { Emoji } from './emoji';
import { extensions, linkRangeKey } from './extensions';
import {
  BoldIcon,
  BulletListIcon,
  CodeBlockIcon,
  CodeIcon,
  EmojiIcon,
  ItalicIcon,
  LinkIcon,
  MentionIcon,
  OrderedListIcon,
  PlusIcon,
  QuoteIcon,
  ReplyIcon,
  SendIcon,
  SmallCloseIcon,
  StrikeIcon,
  UploadIcon,
} from './icons';
import { LinkDialog } from './LinkDialog';
import { createSuggestStore } from './suggest';
import { EmojiList, MentionList, useSuggest } from './SuggestList';
import { UploadTray } from './UploadTray';
import s from './Composer.module.css';
import { PersonAvatar } from '../timeline/PersonAvatar';
import { useChannels } from '../channels/ChannelsProvider';
import { OutsideComposerMark, useOutside } from '../channels/OutsideMark';

const NONE: Upload[] = [];
const idle = { bold: false, italic: false, strike: false, link: false, orderedList: false, bulletList: false, blockquote: false, code: false, codeBlock: false, hasText: false };
const blocked = (u: Upload) => u.status === 'failed' || u.status === 'too-large';
const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

const draftSaveMs = 400;

type Place = { channelId: string; threadRootId?: string };

const messagesAt = (snap: WorkspaceSnapshot, { channelId, threadRootId }: Place) =>
  (threadRootId ? snap.threadTimelines[threadRootId] : snap.timelines[channelId])?.messages;

function sendNow(editor: Editor, store: WorkspaceStore, place: Place, replyToId: string | null, cancelReply: () => void) {
  const draft: Draft = toDraft(editor.getJSON());
  if (replyToId) draft.replyTo = replyToId;
  if (place.threadRootId) draft.threadRootId = place.threadRootId;
  store.send(place.channelId, draft);
  clearDraft(place.channelId, place.threadRootId);
  editor.commands.clearContent(true);
  cancelReply();
}

type LinkEdit = { from: number; to: number; text: string; href: string };

function Tool({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={s.tool}
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Closes a popover on outside press or Escape. */
function useDismiss(open: boolean, onClose: () => void, ...inside: React.RefObject<HTMLElement | null>[]) {
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!inside.some((r) => r.current?.contains(e.target as Node))) close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
    };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export function Composer({
  channelId,
  channelName,
  threadRootId,
  isDm = false,
  placeholder: placeholderText,
}: {
  channelId: string;
  channelName: string;
  threadRootId?: string;
  isDm?: boolean;
  /** Also the field's label (an issue's comment box). */
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const { replyToId, cancelReply, editingId, startEdit } = useComposer();
  const place: Place = { channelId, threadRootId };
  const uploads = useWorkspace((snap) => snap.uploads[channelId] ?? NONE);
  const reply = useWorkspace((snap) => (replyToId ? messagesAt(snap, place)?.find((m) => m.id === replyToId) : undefined));
  const meId = useWorkspace((snap) => snap.me.id);
  useDraftsFor(meId);
  // RulesM5: the outside people are in view at the moment of sending (channel composer only).
  const outside = useOutside(channelId);
  const channelsApi = useChannels();
  const [restored] = useState(() => {
    const saved = getDraft(channelId, threadRootId);
    return saved ? editableContent(saved) : undefined;
  });
  const pendingDraft = useRef<Draft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [mentions] = useState(() => createSuggestStore<Person>((p) => ({ id: p.id, label: p.name })));
  const [emoji] = useState(() => createSuggestStore<Emoji>());
  const mentionState = useSuggest(mentions);
  const emojiState = useSuggest(emoji);

  const [picker, setPicker] = useState<'emoji' | null>(null);
  const [link, setLink] = useState<LinkEdit | null>(null);
  const [dragging, setDragging] = useState(false);
  const [main, setMain] = useState<HTMLElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const waiting = useRef(false);

  const label = placeholderText ?? (threadRootId ? t('thread.replyLabel') : t('composer.label', { channel: t('common.channelName', { name: channelName }) }));
  const placeholder =
    placeholderText ?? (threadRootId ? t('thread.replyPlaceholder') : isDm ? t('composer.placeholderDm', { name: channelName }) : t('composer.placeholder', { channel: channelName }));

  const [exts] = useState(() =>
    extensions({
      members: () => {
        const me = store.getSnapshot().me.id;
        return store.members(channelId).filter((p) => p.id !== me);
      },
      mentions,
      emoji,
      mentionClass: s.mention ?? '',
      placeholder: true,
    }),
  );

  // Options are re-applied on every render (deps []), so these handlers always see current state.
  const onKeyDown = (e: KeyboardEvent) => {
    if (mentions.isOpen() || emoji.isOpen()) return false;
    if (e.key === 'Escape' && (mentions.isActive() || emoji.isActive())) return false;
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isImeEnter(e)) return false;
      e.preventDefault();
      send();
      return true;
    }
    if (e.key === 'Escape' && replyToId) {
      cancelReply();
      return true;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.altKey && editor.isEmpty) {
      const snap = store.getSnapshot();
      const own = messagesAt(snap, place)?.findLast((m) => m.sender.id === snap.me.id && m.status === 'sent' && (m.kind ?? 'text') === 'text');
      if (!own) return false;
      startEdit(own.id);
      return true;
    }
    return false;
  };
  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return false;
    store.attach(channelId, files);
    return true;
  };

  const editor = useEditor(
    {
      extensions: exts,
      content: restored,
      autofocus: 'end',
      editorProps: {
        attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, 'aria-placeholder': placeholder, class: s.field ?? '' },
        handleKeyDown: (_view, e) => onKeyDown(e),
        handlePaste: (_view, e) => onPaste(e),
      },
      onUpdate: ({ editor: ed }) => {
        store.setTyping(channelId, ed.getText().trim().length > 0);
        pendingDraft.current = toDraft(ed.getJSON());
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(saveDraft, draftSaveMs);
      },
    },
    [],
  );

  function saveDraft() {
    const d = pendingDraft.current;
    pendingDraft.current = null;
    if (d) setDraft({ channelId, threadRootId, body: d.body, html: d.html, mentions: d.mentions });
  }

  // Leaving the channel or thread keeps what was typed, even inside the debounce window.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      const d = pendingDraft.current;
      if (d) setDraft({ channelId, threadRootId, body: d.body, html: d.html, mentions: d.mentions });
    },
    [channelId, threadRootId],
  );

  const ui = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed.isDestroyed ? idle : ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      strike: ed.isActive('strike'),
      link: ed.isActive('link'),
      orderedList: ed.isActive('orderedList'),
      bulletList: ed.isActive('bulletList'),
      blockquote: ed.isActive('blockquote'),
      code: ed.isActive('code'),
      codeBlock: ed.isActive('codeBlock'),
      hasText: ed.getText().trim().length > 0,
    }),
  });

  const isBlocked = uploads.some(blocked);
  const canSend = !isBlocked && (ui.hasText || uploads.some((u) => u.status === 'done' || u.status === 'uploading'));

  const doSend = () => {
    waiting.current = false;
    sendNow(editor, store, place, replyToId, cancelReply);
  };

  const send = () => {
    const ups = store.getSnapshot().uploads[channelId] ?? NONE;
    if (ups.some(blocked)) return;
    const uploading = ups.some((u) => u.status === 'uploading');
    const hasText = !!toDraft(editor.getJSON()).body;
    if (!hasText && !uploading && !ups.some((u) => u.status === 'done')) return;
    if (uploading) waiting.current = true;
    else doSend();
  };

  // Send waits for uploads in progress; a failed one cancels the wait.
  useEffect(
    () =>
      store.subscribe(() => {
        if (!waiting.current) return;
        const ups = store.getSnapshot().uploads[channelId] ?? NONE;
        if (ups.some(blocked) || ups.some((u) => u.status === 'uploading')) {
          if (ups.some(blocked)) waiting.current = false;
          return;
        }
        waiting.current = false;
        sendNow(editor, store, { channelId, threadRootId }, replyToId, cancelReply);
      }),
    [store, channelId, threadRootId, editor, replyToId, cancelReply],
  );

  useEffect(() => () => store.setTyping(channelId, false), [store, channelId]);

  useEffect(() => {
    if (replyToId) editor.commands.focus('end');
  }, [editor, replyToId]);

  const wasEditing = useRef(editingId);
  useEffect(() => {
    if (wasEditing.current && !editingId) editor.commands.focus('end');
    wasEditing.current = editingId;
  }, [editor, editingId]);

  // Drag files anywhere over the channel (the main area) or the thread panel to attach them.
  const dockRef = useCallback(
    (el: HTMLDivElement | null) => setMain(el ? (el.closest<HTMLElement>(threadRootId ? 'aside' : 'main') ?? el.parentElement) : null),
    [threadRootId],
  );
  useEffect(() => {
    if (!main) return;
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) store.attach(channelId, files);
      editor.commands.focus('end');
    };
    main.addEventListener('dragenter', enter);
    main.addEventListener('dragover', over);
    main.addEventListener('dragleave', leave);
    main.addEventListener('drop', drop);
    return () => {
      main.removeEventListener('dragenter', enter);
      main.removeEventListener('dragover', over);
      main.removeEventListener('dragleave', leave);
      main.removeEventListener('drop', drop);
    };
  }, [main, store, channelId, editor]);

  const closePicker = useCallback(() => {
    setPicker(null);
    editor.commands.focus();
  }, [editor]);
  useDismiss(picker === 'emoji', closePicker, floatRef, emojiButton);

  const openLink = () => {
    let { from, to } = editor.state.selection;
    const href = (editor.getAttributes('link').href as string | undefined) ?? '';
    if (href && from === to) {
      editor.commands.extendMarkRange('link');
      ({ from, to } = editor.state.selection);
    }
    editor.view.dispatch(editor.state.tr.setMeta(linkRangeKey, from === to ? null : { from, to }));
    setPicker(null);
    setLink({ from, to, text: editor.state.doc.textBetween(from, to, ' '), href });
  };
  const closeLink = useCallback(() => {
    editor.view.dispatch(editor.state.tr.setMeta(linkRangeKey, null));
    setLink(null);
    editor.commands.focus();
  }, [editor]);
  useDismiss(!!link, closeLink, floatRef);

  const saveLink = (text: string, href: string | null) => {
    if (!link) return;
    const { from, to } = link;
    const chain = editor.chain().focus();
    if (!href) chain.setTextSelection({ from, to }).unsetLink().setTextSelection(to);
    else if (from !== to && text === link.text) chain.setTextSelection({ from, to }).setLink({ href }).setTextSelection(to);
    else chain.insertContentAt({ from, to }, { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] });
    chain.run();
    closeLink();
  };

  const insertMention = () => {
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from, '\n', '\n');
    editor.chain().focus().insertContent(before && !/\s/.test(before) ? ' @' : '@').run();
  };

  const placeList = (rect: DOMRect | null) => (el: HTMLElement) => {
    const box = boxRef.current?.getBoundingClientRect();
    el.style.left = box && rect ? `${Math.max(0, Math.min(rect.left - box.left - 32, box.width - 300))}px` : '0px';
  };

  const toggle = (run: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () => run(editor.chain().focus()).run();

  return (
    <div className={threadRootId ? `${s.dock} ${s.threadDock}` : s.dock} ref={dockRef}>
      <div className={s.float} ref={floatRef}>
        {picker === 'emoji' && (
          <EmojiPicker
            style={{ left: 0 }}
            onPick={(e) => {
              editor.chain().focus().insertContent(e).run();
              setPicker(null);
            }}
          />
        )}
        {link && <LinkDialog style={{ left: 40 }} text={link.text} href={link.href} onSave={saveLink} onCancel={closeLink} />}
        {mentionState && mentionState.items.length > 0 && (
          <MentionList store={mentions} state={mentionState} label={t('composer.mention')} place={placeList(mentionState.rect)} />
        )}
        {emojiState && emojiState.items.length > 0 && (
          <EmojiList store={emoji} state={emojiState} label={t('composer.emoji')} place={placeList(emojiState.rect)} />
        )}
      </div>
      <div className={s.box} ref={boxRef}>
        {reply && (
          <div className={s.replyBar}>
            <span className={s.replyIcon}>
              <ReplyIcon />
            </span>
            <PersonAvatar size={16} person={reply.sender} />
            <span className={s.replyName}>{reply.sender.name}</span>
            <span className={s.replyText}>{reply.body || reply.media?.name}</span>
            <button type="button" className={s.replyCancel} aria-label={t('composer.cancelReply')} onClick={cancelReply}>
              <SmallCloseIcon />
            </button>
          </div>
        )}
        <div role="toolbar" aria-label={t('composer.formatting')} className={s.toolbar}>
          <Tool label={t('composer.bold')} pressed={ui.bold} onClick={toggle((c) => c.toggleBold())}>
            <BoldIcon />
          </Tool>
          <Tool label={t('composer.italic')} pressed={ui.italic} onClick={toggle((c) => c.toggleItalic())}>
            <ItalicIcon />
          </Tool>
          <Tool label={t('composer.strike')} pressed={ui.strike} onClick={toggle((c) => c.toggleStrike())}>
            <StrikeIcon />
          </Tool>
          <span className={s.toolSep} />
          <Tool label={t('composer.link')} pressed={ui.link || !!link} onClick={openLink}>
            <LinkIcon />
          </Tool>
          <span className={s.toolSep} />
          <Tool label={t('composer.orderedList')} pressed={ui.orderedList} onClick={toggle((c) => c.toggleOrderedList())}>
            <OrderedListIcon />
          </Tool>
          <Tool label={t('composer.bulletList')} pressed={ui.bulletList} onClick={toggle((c) => c.toggleBulletList())}>
            <BulletListIcon />
          </Tool>
          <span className={s.toolSep} />
          <Tool label={t('composer.quote')} pressed={ui.blockquote} onClick={toggle((c) => c.toggleBlockquote())}>
            <QuoteIcon />
          </Tool>
          <Tool label={t('composer.code')} pressed={ui.code} onClick={toggle((c) => c.toggleCode())}>
            <CodeIcon />
          </Tool>
          <Tool label={t('composer.codeBlock')} pressed={ui.codeBlock} onClick={toggle((c) => c.toggleCodeBlock())}>
            <CodeBlockIcon />
          </Tool>
        </div>
        <UploadTray uploads={uploads} onRetry={(id) => store.retryUpload(channelId, id)} onRemove={(id) => store.removeUpload(channelId, id)} />
        <EditorContent editor={editor} className={s.editor} />
        <div className={s.actions}>
          <button type="button" className={s.attach} aria-label={t('composer.attach')} onClick={() => fileInput.current?.click()}>
            <PlusIcon />
          </button>
          <button
            ref={emojiButton}
            type="button"
            className={s.action}
            aria-label={t('composer.emoji')}
            aria-expanded={picker === 'emoji'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (picker === 'emoji' ? closePicker() : (setLink(null), setPicker('emoji')))}
          >
            <EmojiIcon />
          </button>
          <button type="button" className={s.action} aria-label={t('composer.mention')} onMouseDown={(e) => e.preventDefault()} onClick={insertMention}>
            <MentionIcon />
          </button>
          <span className={s.spacer} />
          {!threadRootId && <OutsideComposerMark people={outside} onClick={isDm ? undefined : () => channelsApi.details(channelId, 'members')} />}
          <button
            type="button"
            className={s.send}
            onMouseDown={(e) => e.preventDefault()}
            onClick={send}
            disabled={!canSend}
            aria-label={threadRootId ? t('thread.send') : t('composer.send')}
          >
            <SendIcon />
          </button>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) store.attach(channelId, files);
          e.target.value = '';
          editor.commands.focus();
        }}
      />
      {dragging &&
        main &&
        createPortal(
          <div className={s.drop} aria-hidden="true">
            <div className={s.dropZone}>
              <span className={s.dropIcon}>
                <UploadIcon />
              </span>
              <span className={s.dropText}>{t('composer.dropTo', { channel: channelName })}</span>
            </div>
          </div>,
          main,
        )}
    </div>
  );
}
