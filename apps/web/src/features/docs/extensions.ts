// The Docs block set (DocsBoardsRules, Blocks) over the page's Y.Doc. A block move is one transaction (dnd-implementation 4).
import { Extension, mergeAttributes, Node, type AnyExtension, type Editor, type NodeViewRenderer, type Range } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import NodeRange from '@tiptap/extension-node-range';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import Suggestion from '@tiptap/suggestion';
import { PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Doc } from 'yjs';
import type { SuggestStore } from '../../app/composer/suggest';

export type BlockId = 'text' | 'h1' | 'h2' | 'bullets' | 'numbered' | 'checklist' | 'quote' | 'callout' | 'code' | 'table' | 'image' | 'pageLink' | 'divider';
export const BLOCKS: BlockId[] = ['text', 'h1', 'h2', 'bullets', 'numbered', 'checklist', 'quote', 'callout', 'code', 'table', 'image', 'pageLink', 'divider'];

export type LinkItem = { kind: 'page'; id: string; title: string; path: string } | { kind: 'new'; title: string };

export const slashKey = new PluginKey('docsSlash');
export const linkKey = new PluginKey('docsLink');

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0],
});

/** `[[` links: the id is the page room; the title shown is always the page's current one (PageLinkView). */
export const PageLink = Node.create({
  name: 'pageLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    id: { default: null, parseHTML: (el) => el.getAttribute('data-page'), renderHTML: (a) => ({ 'data-page': a.id as string }) },
    title: { default: '', parseHTML: (el) => el.textContent ?? '', renderHTML: () => ({}) },
  }),
  parseHTML: () => [{ tag: 'a[data-page]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['a', mergeAttributes(HTMLAttributes, { href: `/docs/${encodeURIComponent(String(node.attrs.id))}` }), String(node.attrs.title || '')],
  renderText: ({ node }) => String(node.attrs.title || ''),
});

/** A file that isn't an image: one row with its name and size (FileView). */
const DocFile = Node.create({
  name: 'docFile',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    src: { default: null, parseHTML: (el) => el.getAttribute('data-file'), renderHTML: (a) => ({ 'data-file': a.src as string }) },
    name: { default: '', parseHTML: (el) => el.textContent ?? '', renderHTML: () => ({}) },
    size: { default: null, parseHTML: (el) => Number(el.getAttribute('data-size')) || null, renderHTML: (a) => (a.size ? { 'data-size': String(a.size) } : {}) },
  }),
  parseHTML: () => [{ tag: 'div[data-file]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['div', HTMLAttributes, String(node.attrs.name || '')],
  renderText: ({ node }) => String(node.attrs.name || ''),
});

/** Alt+Up / Alt+Down: the top-level block under the caret swaps with its neighbour in one step. */
const BlockMoves = Extension.create({
  name: 'blockMoves',
  addKeyboardShortcuts() {
    const move = (dir: -1 | 1) => () => {
      const { state, view } = this.editor;
      const { $from, from } = state.selection;
      if ($from.depth < 1) return false;
      const i = $from.index(0);
      const j = i + dir;
      if (j < 0 || j >= state.doc.childCount) return true;
      const node = state.doc.child(i);
      const other = state.doc.child(j);
      let pos = 0;
      for (let k = 0; k < Math.min(i, j); k++) pos += state.doc.child(k).nodeSize;
      const offset = from - (dir < 0 ? pos + other.nodeSize : pos);
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize + other.nodeSize, dir < 0 ? [node, other] : [other, node]);
      const at = dir < 0 ? pos + offset : pos + other.nodeSize + offset;
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size)))).scrollIntoView();
      view.dispatch(tr);
      return true;
    };
    return { 'Alt-ArrowUp': move(-1), 'Alt-ArrowDown': move(1) };
  },
});

function suggestions(o: { slash: SuggestStore<BlockId>; links: SuggestStore<LinkItem>; slashItems: (q: string) => BlockId[]; linkItems: (q: string) => LinkItem[]; onSlash: (id: BlockId, range: Range) => void; onLink: (item: LinkItem, range: Range) => void }) {
  return Extension.create({
    name: 'docsSuggestions',
    addProseMirrorPlugins() {
      return [
        Suggestion<BlockId, BlockId>({
          editor: this.editor,
          pluginKey: slashKey,
          char: '/',
          items: ({ query }) => o.slashItems(query),
          command: ({ range, props }) => o.onSlash(props, range),
          render: o.slash.render,
        }),
        Suggestion<LinkItem, LinkItem>({
          editor: this.editor,
          pluginKey: linkKey,
          char: '[[',
          allowSpaces: true,
          decorationClass: 'docs-link-query',
          items: ({ query }) => o.linkItems(query),
          command: ({ range, props }) => o.onLink(props, range),
          render: o.links.render,
        }),
      ];
    },
  });
}

export interface DocsExtensionOptions {
  doc: Doc;
  slash: SuggestStore<BlockId>;
  links: SuggestStore<LinkItem>;
  slashItems: (q: string) => BlockId[];
  linkItems: (q: string) => LinkItem[];
  onSlash: (id: BlockId, range: Range) => void;
  onLink: (item: LinkItem, range: Range) => void;
  /** Node views that need React context (page link titles, images, files). */
  views: { pageLink: NodeViewRenderer; image: NodeViewRenderer; file: NodeViewRenderer };
}

export function docsExtensions(o: DocsExtensionOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      trailingNode: false,
      heading: { levels: [2, 3] },
      link: { openOnClick: false, autolink: true },
      dropcursor: { color: false, width: 2, class: 'docs-dropcursor' },
    }),
    Collaboration.configure({ document: o.doc, field: 'default' }),
    NodeRange,
    TaskList,
    TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => node.textContent } }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Image.extend({ addNodeView: () => o.views.image }),
    DocFile.extend({ addNodeView: () => o.views.file }),
    Callout,
    PageLink.extend({ addNodeView: () => o.views.pageLink }),
    BlockMoves,
    suggestions(o),
  ];
}

/** Turns the block at the caret into `id` (the `/` list and the `+` list end here). */
export function applyBlock(editor: Editor, id: BlockId) {
  const c = editor.chain().focus();
  switch (id) {
    case 'text':
      return c.setParagraph().run();
    case 'h1':
      return c.setHeading({ level: 2 }).run();
    case 'h2':
      return c.setHeading({ level: 3 }).run();
    case 'bullets':
      return c.toggleBulletList().run();
    case 'numbered':
      return c.toggleOrderedList().run();
    case 'checklist':
      return c.toggleTaskList().run();
    case 'quote':
      return c.setParagraph().toggleBlockquote().run();
    case 'callout':
      return c.setNode('callout').run();
    case 'code':
      return c.setCodeBlock().run();
    case 'table':
      return c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case 'divider':
      return c.setHorizontalRule().run();
    case 'pageLink':
      return c.insertContent('[[').run();
    case 'image':
      return false;
  }
}
