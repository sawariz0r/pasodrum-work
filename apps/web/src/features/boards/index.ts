// Boards (D-37): projects per space, issues on a board or in a list, an issue panel beside it. Only the rail item and
// the routes load up front; the screen, the column and drag and drop load on the first visit. Removing this folder and
// its line in features/index.ts drops the rail item; /boards links fall to NotAvailable and the rooms stay intact.
import { createElement } from 'react';
import { lazyComponent } from '../../app/lazy';
import { defineFeature } from '../../app/registry';
import { useWorkspace } from '../../matrix';
import { BoardsIcon, useBoardsLabel } from './Boards';
import { IssueCard } from './IssueCard';

const BoardsScreen = lazyComponent(() => import('./BoardsScreen').then((m) => m.BoardsScreen));
const BoardsColumn = lazyComponent(() => import('./BoardsColumn').then((m) => m.BoardsColumn));
/** Unread issue mentions and assignments (the same items Activity lists). */
const useBoardsBadge = () => useWorkspace((x) => x.activity.filter((a) => a.unread && a.issue).length);

export default defineFeature({
  id: 'boards',
  rail: [{ id: 'boards', to: '/boards', icon: createElement(BoardsIcon), useLabel: useBoardsLabel, useBadge: useBoardsBadge }],
  routes: [{ path: 'boards/*', element: createElement(BoardsScreen), column: createElement(BoardsColumn) }],
  messageParts: [{ id: 'issue-card', Part: IssueCard }],
});
