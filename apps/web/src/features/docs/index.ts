// Docs (M7): a rail page that says Soon until the real editor arrives (D-33). Nothing is stored.
import { createElement } from 'react';
import { defineFeature } from '../../app/registry';
import { DocsIcon, DocsPage, useDocsLabel } from './Docs';

export default defineFeature({
  id: 'docs',
  rail: [{ id: 'docs', to: '/docs', icon: createElement(DocsIcon), useLabel: useDocsLabel }],
  routes: [{ path: 'docs', element: createElement(DocsPage) }],
});
