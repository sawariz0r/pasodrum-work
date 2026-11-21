// Boards (M7): a rail page that says Soon until real boards arrive (D-33). Nothing is stored.
import { createElement } from 'react';
import { defineFeature } from '../../app/registry';
import { BoardsIcon, BoardsPage, useBoardsLabel } from './Boards';

export default defineFeature({
  id: 'boards',
  rail: [{ id: 'boards', to: '/boards', icon: createElement(BoardsIcon), useLabel: useBoardsLabel }],
  routes: [{ path: 'boards', element: createElement(BoardsPage) }],
});
