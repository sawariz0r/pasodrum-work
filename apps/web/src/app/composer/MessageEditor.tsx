// Edit in place (MsgEdit board), mounted by a message row while editing. Enter saves, Esc cancels, saving empty asks to delete.
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { EditorContent, useEditor } from '@tiptap/react';
import { useStore, type Message, type Person } from '../../matrix';
import { isImeEnter } from '../../ui';
import { DeleteConfirm } from './DeleteConfirm';
import { editableContent, toDraft } from './draft';
import type { Emoji } from './emoji';
import { extensions } from './extensions';
import { createSuggestStore } from './suggest';
import { EmojiList, MentionList, useSuggest } from './SuggestList';
import c from './Composer.module.css';
import s from './MessageEditor.module.css';

const atCaret = (rect: DOMRect | null): CSSProperties =>
  rect ? { position: 'fixed', zIndex: 40, left: Math.max(8, rect.left - 32), bottom: window.innerHeight - rect.top + 8 } : { display: 'none' };

export function MessageEditor({ message, onDone }: { message: Message; onDone: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const [mentions] = useState(() => createSuggestStore<Person>((p) => ({ id: p.id, label: p.name })));
  const [emoji] = useState(() => createSuggestStore<Emoji>());
  const mentionState = useSuggest(mentions);
  const emojiState = useSuggest(emoji);
  const [confirm, setConfirm] = useState(false);
  
  const [exts] = useState(() =>
    extensions({
      members: () => {
        const me = store.getSnapshot().me.id;
        return store.members(message.channelId).filter((p) => p.id !== me);
      },
      mentions,
      emoji,
      mentionClass: c.mention ?? '',
    }),
  );

  // Options are re-applied on every render (deps []), so this sees current state.
  const onKeyDown = (e: KeyboardEvent) => {
    if (mentions.isOpen() || emoji.isOpen()) return false;
    if (e.key === 'Escape') {
      if (mentions.isActive() || emoji.isActive()) return false;
      e.preventDefault();
      onDone();
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey && isImeEnter(e)) {
      e.preventDefault();
      save();
      return true;
    }
    return false;
  };

  const editor = useEditor(
    {
      extensions: exts,
      content: editableContent(message),
      autofocus: 'end',
      editorProps: {
        attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('composer.editLabel'), class: `${c.field} ${s.field}` },
        handleKeyDown: (_view, e) => onKeyDown(e),
      },
    },
    [],
  );

  const save = () => {
    const draft = toDraft(editor.getJSON());
    if (!draft.body) {
      setConfirm(true);
      return;
    }
    if (draft.body !== message.body || (draft.html ?? '') !== (message.html ?? '')) store.edit(message.channelId, message.id, draft);
    onDone();
  };

  return (
    <div className={s.box}>
      <EditorContent editor={editor} />
      <div className={s.actions}>
        <button type="button" className={s.cancel} onClick={onDone}>
          {t('composer.cancel')}
        </button>
        <button type="button" className={s.save} onClick={save}>
          {t('composer.save')}
        </button>
      </div>
      {mentionState &&
        mentionState.items.length > 0 &&
        createPortal(<MentionList store={mentions} state={mentionState} label={t('composer.mention')} style={atCaret(mentionState.rect)} />, document.body)}
      {emojiState &&
        emojiState.items.length > 0 &&
        createPortal(<EmojiList store={emoji} state={emojiState} label={t('composer.emoji')} style={atCaret(emojiState.rect)} />, document.body)}
      <DeleteConfirm
        message={message}
        open={confirm}
        onCancel={() => {
          setConfirm(false);
          editor.commands.focus('end');
        }}
        onDelete={() => {
          setConfirm(false);
          store.remove(message.channelId, message.id);
          onDone();
        }}
      />
    </div>
  );
}
