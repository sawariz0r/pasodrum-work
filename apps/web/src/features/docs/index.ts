// Docs (D-37): pages per space, edited together. Screens and the tree load on first visit (yjs, TipTap, drag and drop).
import { createElement } from 'react';
import { lazyComponent } from '../../app/lazy';
import { defineFeature } from '../../app/registry';
import { DocCard } from './DocCard';
import { DocsColumnFallback, DocsIcon, useDocsLabel } from './Docs';

const DocsScreen = lazyComponent(() => import('./DocsScreen').then((m) => m.DocsScreen));
const DocsColumn = lazyComponent(
  () => import('./DocsColumn').then((m) => m.DocsColumn),
  () => createElement(DocsColumnFallback),
);

const element = createElement(DocsScreen);
const column = createElement(DocsColumn);

export default defineFeature({
  id: 'docs',
  rail: [{ id: 'docs', to: '/docs', icon: createElement(DocsIcon), useLabel: useDocsLabel }],
  routes: [
    { path: 'docs', element, column },
    { path: 'docs/:pageId', element, column },
  ],
  messageParts: [{ id: 'doc-card', Part: DocCard }],
});
