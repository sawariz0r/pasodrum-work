// The issue description, edited in place with the composer's block set (shared Docs blocks are a follow-up, D-37).
// Loads with TipTap on first use; saves on blur when it changed (last write wins).
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import c from '../../app/composer/Composer.module.css';
import { editableContent, toDraft } from '../../app/composer/draft';
import type { Emoji } from '../../app/composer/emoji';
import { extensions } from '../../app/composer/extensions';
import { createSuggestStore } from '../../app/composer/suggest';
import { EmojiList, MentionList, useSuggest } from '../../app/composer/SuggestList';
import type { Person } from '../../matrix';

const atCaret = (rect: DOMRect | null): CSSProperties =>
  rect ? { position: 'fixed', zIndex: 40, left: Math.max(8, rect.left - 32), top: rect.bottom + 8 } : { display: 'none' };

/** Shows a newer saved description, unless the person is editing it. */
function show(editor: Editor, html: string): boolean {
  if (editor.isDestroyed || editor.isFocused) return false;
  editor.commands.setContent(html, { emitUpdate: false });
  return true;
}

type Props = {
  value?: { body: string; html?: string };
  people: Person[];
  label: string;
  mentionLabel: string;
  emojiLabel: string;
  onSave: (d: { body: string; html?: string }) => void;
};

export function DescriptionEditor({ value, people, label, mentionLabel, emojiLabel, onSave }: Props) {
  const [mentions] = useState(() => createSuggestStore<Person>((p) => ({ id: p.id, label: p.name })));
  const [emoji] = useState(() => createSuggestStore<Emoji>());
  const mentionState = useSuggest(mentions);
  const emojiState = useSuggest(emoji);
  // Read by the editor's callbacks, which are set up once.
  const [latest] = useState(() => ({ people, value, onSave, shown: value ? editableContent(value) : '' }));
  useLayoutEffect(() => {
    Object.assign(latest, { people, value, onSave });
  });
  const [exts] = useState(() => extensions({ members: () => latest.people, mentions, emoji, mentionClass: c.mention ?? '', placeholder: true }));
  const content = value ? editableContent(value) : '';

  const editor = useEditor(
    {
      extensions: exts,
      content,
      editorProps: {
        attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, 'aria-placeholder': label },
        handleKeyDown: (_view, e) => {
          if (e.key === 'Escape' && !mentions.isActive() && !emoji.isActive()) {
            (e.target as HTMLElement).blur();
            return true;
          }
          return false;
        },
      },
      onBlur: ({ editor: ed }) => {
        const { value: was, onSave: save } = latest;
        const draft = toDraft(ed.getJSON());
        if (draft.body === (was?.body ?? '') && (draft.html ?? '') === (was?.html ?? '')) return;
        save({ body: draft.body, ...(draft.html ? { html: draft.html } : {}) });
      },
    },
    [],
  );

  useEffect(() => {
    if (editor && latest.shown !== content && show(editor, content)) Object.assign(latest, { shown: content });
  }, [editor, content, latest]);

  return (
    <>
      <EditorContent editor={editor} />
      {mentionState &&
        mentionState.items.length > 0 &&
        createPortal(<MentionList store={mentions} state={mentionState} label={mentionLabel} style={atCaret(mentionState.rect)} />, document.body)}
      {emojiState &&
        emojiState.items.length > 0 &&
        createPortal(<EmojiList store={emoji} state={emojiState} label={emojiLabel} style={atCaret(emojiState.rect)} />, document.body)}
    </>
  );
}
