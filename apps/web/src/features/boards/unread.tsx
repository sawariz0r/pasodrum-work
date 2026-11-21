// Unread issue mentions and assignments inside Boards: the same Activity items (`issue` set) the rail badge counts.
import pages from '../../app/pages/Pages.module.css';
import { useWorkspace, type ActivityItem, type WorkspaceSnapshot } from '../../matrix';
import { useT } from './strings';

const unreadIn = (x: WorkspaceSnapshot, pick: (a: ActivityItem) => boolean) => x.activity.filter((a) => a.unread && !!a.issue && pick(a));

export const useProjectUnread = (projectId: string) => useWorkspace((x) => unreadIn(x, (a) => a.channelId === projectId).length);
export const useIssueUnread = (issueId: string) => useWorkspace((x) => unreadIn(x, (a) => a.issue!.id === issueId).length > 0);
/** Comments on this issue that mentioned me, read or not (so the comment glyph shows before the thread loads). */
export const useIssueMentions = (issueId: string) => useWorkspace((x) => x.activity.filter((a) => a.kind === 'mention' && a.issue?.id === issueId).length);
/** The newest unread item on this issue (Activity is newest first), optionally only mentions. */
export const useNewestUnread = (issueId: string, mention = false) =>
  useWorkspace((x) => unreadIn(x, (a) => a.issue!.id === issueId && (!mention || a.kind === 'mention'))[0]?.id);

/** Activity's unread dot, on a card or a list row with something new for me. */
export function UnreadDot({ issueId }: { issueId: string }) {
  const t = useT();
  return useIssueUnread(issueId) ? <span role="img" aria-label={t('unread')} className={pages.dot} /> : null;
}
