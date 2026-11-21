// Boards issues aimed at me, for Activity (D-37): a comment that mentions me, or someone else assigning me an issue.
// Project rooms are kept out of the store's thread/activity scan (issue comments would flood Threads); this adds only these two.
import { EventType, type MatrixEvent, type Room } from 'matrix-js-sdk';
import type { ActivityItem, Message, Person } from './types';

export const PROJECT_TYPE = 'work.pasodrum.boards.project';
const ISSUE = 'work.pasodrum.boards.issue';
const THREAD = 'm.thread';

type Content = Record<string, unknown>;

export interface IssueActivityContext {
  me: string;
  /** A thread reply as the store maps it (mentionsMe set). */
  message(ev: MatrixEvent, room: Room): Message | null;
  person(room: Room, userId: string): Person;
  unread(room: Room, ev: MatrixEvent, rootId?: string): boolean;
}

const sent = (ev: MatrixEvent) => !ev.status && !!ev.getId()?.startsWith('$');

export function issueActivityOf(rooms: Room[], ctx: IssueActivityContext): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const room of rooms) {
    const key = room.currentState.getStateEvents(PROJECT_TYPE, '')?.getContent().key;
    // Deleted issues keep only their number (no `order`): nothing to open.
    const issueOf = (issueId: string) => {
      const c = room.currentState.getStateEvents(ISSUE, issueId)?.getContent() as Content | undefined;
      if (!c || typeof c.order !== 'string') return null;
      const n = typeof c.n === 'number' ? c.n : 0;
      return { id: issueId, title: typeof c.title === 'string' ? c.title : '', key: typeof key === 'string' && key ? `${key}-${n}` : String(n) };
    };
    for (const ev of room.getLiveTimeline().getEvents()) {
      if (ev.getSender() === ctx.me || !sent(ev) || ev.isRedacted()) continue;
      if (ev.getType() === ISSUE && ev.isState()) {
        if (ev.getContent().assignee !== ctx.me || ev.getPrevContent().assignee === ctx.me) continue;
        const issue = issueOf(ev.getStateKey()!);
        if (!issue) continue;
        const message: Message = { id: ev.getId()!, channelId: room.roomId, sender: ctx.person(room, ev.getSender()!), body: issue.title, ts: ev.getTs(), status: 'sent' };
        items.push({ id: message.id, kind: 'assigned', channelId: room.roomId, message, unread: ctx.unread(room, ev), issue: { id: issue.id, key: issue.key } });
      } else if (ev.getType() === EventType.RoomMessage) {
        const rel = ev.getContent()['m.relates_to'] as { rel_type?: string; event_id?: string } | undefined;
        if (rel?.rel_type !== THREAD || !rel.event_id) continue;
        const issue = issueOf(rel.event_id);
        const message = issue && ctx.message(ev, room);
        if (!issue || !message?.mentionsMe) continue;
        items.push({ id: message.id, kind: 'mention', channelId: room.roomId, threadRootId: issue.id, message, unread: ctx.unread(room, ev, issue.id), issue: { id: issue.id, key: issue.key } });
      }
    }
  }
  return items;
}
