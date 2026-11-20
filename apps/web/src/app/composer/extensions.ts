// TipTap setup shared by the composer and the edit-in-place editor.
import { Extension, InputRule, mergeAttributes, type AnyExtension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Suggestion from '@tiptap/suggestion';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Person } from '../../matrix';
import { pillPrefix } from './draft';
import { emojiData, loadEmoji, searchEmoji, type Emoji } from './emoji';
import type { SuggestStore } from './suggest';

export const emojiKey = new PluginKey('emoji');
export const mentionKey = new PluginKey('mention');
export const linkRangeKey = new PluginKey<DecorationSet>('linkRange');

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

export function matchPeople(people: Person[], query: string, limit = 5): Person[] {
  const q = query.toLowerCase();
  const hits = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.slice(1).toLowerCase().startsWith(q));
  const starts = (p: Person) => (p.name.toLowerCase().startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b) || collator.compare(a.name, b.name)).slice(0, limit);
}

/** Shift+Enter: a new line (list item, code line or paragraph). Plain Enter is handled by the host through isImeEnter. */
const NewLine = Extension.create({
  name: 'newLine',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Shift-Enter': ({ editor }) =>
        editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.splitListItem('listItem'),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock(),
        ]),
    };
  },
});

/** Keeps the text a link is being added to highlighted while focus is in the link dialog. */
const LinkRange = Extension.create({
  name: 'linkRange',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: linkRangeKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(linkRangeKey) as { from: number; to: number } | null | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta) return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, meta.to, { class: 'pd-link-range' })]);
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => linkRangeKey.getState(state) },
      }),
    ];
  },
});

function emojiExtension(store: SuggestStore<Emoji>) {
  return Extension.create({
    name: 'emojiShortcodes',
    addInputRules() {
      return [
        new InputRule({
          find: /(?:^|\s):([a-z0-9_+-]{2,}):$/,
          handler: ({ range, match, chain }) => {
            const hit = emojiData()?.byCode.get(match[1]!);
            if (!hit) return null;
            const from = range.from + match[0].indexOf(':');
            chain().insertContentAt({ from, to: range.to }, hit.unicode).run();
          },
        }),
      ];
    },
    addProseMirrorPlugins() {
      return [
        Suggestion<Emoji, Emoji>({
          editor: this.editor,
          pluginKey: emojiKey,
          char: ':',
          minQueryLength: 2,
          items: async ({ query }) => (/^[\p{L}\p{N}_+-]+$/u.test(query) ? searchEmoji(await loadEmoji(), query, 8) : []),
          command: ({ editor, range, props }) => {
            editor.chain().focus().insertContentAt(range, props.unicode).run();
          },
          render: store.render,
        }),
      ];
    },
  });
}

export interface ExtensionOptions {
  members: () => Person[];
  mentions: SuggestStore<Person>;
  emoji: SuggestStore<Emoji>;
  mentionClass: string;
  /** Shows the view's aria-placeholder attribute while empty. */
  placeholder?: boolean;
}

export function extensions({ members, mentions, emoji, mentionClass, placeholder }: ExtensionOptions): AnyExtension[] {
  const list: AnyExtension[] = [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
      underline: false,
      trailingNode: false,
      dropcursor: false,
      link: false,
    }),
    // Autolink makes TipTap's link inclusive; typing after a link should not extend it.
    Link.extend({ inclusive: false }).configure({ openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' }),
    Mention.extend({
      parseHTML() {
        return [
          { tag: 'span[data-type="mention"]' },
          {
            tag: `a[href^="${pillPrefix}@"]`,
            priority: 100,
            getAttrs: (el) => ({
              id: decodeURIComponent((el as HTMLElement).getAttribute('href')!.slice(pillPrefix.length)),
              label: (el as HTMLElement).textContent?.replace(/^@/, '') ?? '',
            }),
          },
        ];
      },
    }).configure({
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
      renderHTML: ({ node, options }) => [
        'span',
        mergeAttributes({ 'data-type': 'mention', 'data-id': node.attrs.id, class: mentionClass }, options.HTMLAttributes),
        `@${node.attrs.label ?? node.attrs.id}`,
      ],
      suggestion: {
        char: '@',
        pluginKey: mentionKey,
        items: ({ query, editor }) => {
          const already = new Set<string>();
          editor.state.doc.descendants((n) => {
            if (n.type.name === 'mention') already.add(String(n.attrs.id));
          });
          return matchPeople(members().filter((p) => !already.has(p.id)), query);
        },
        render: mentions.render,
      },
    }),
    emojiExtension(emoji),
    NewLine,
    LinkRange,
  ];
  if (placeholder)
    list.push(
      Placeholder.configure({
        placeholder: ({ editor }) => (editor.options.editorProps.attributes as Record<string, string> | undefined)?.['aria-placeholder'] ?? '',
      }),
    );
  return list;
}
