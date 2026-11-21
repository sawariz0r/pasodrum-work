import { EventType, RelationType, type MatrixClient, type TimelineEvents } from 'matrix-js-sdk';
import type { SealedFile } from './attachments';
import { escapeHtml } from './html';

export type MsgType = 'm.text' | 'm.emote' | 'm.notice' | 'm.image' | 'm.video' | 'm.audio' | 'm.file';

/** D-05: everything we send reads fully in a standard client; our data rides as extra work.pasodrum.* keys. */
export interface TextMessage {
  body: string;
  html?: string;
  msgtype?: MsgType;
  /** User ids for m.mentions (sent whenever given, so standard clients don't guess from the text). */
  mentions?: string[];
  /** Media messages: `body` is the file name. */
  /** `sealed`: encrypted media (M6) goes in `file`, not `url`. */
  file?: { url: string; info: Record<string, unknown>; sealed?: SealedFile };
  replyTo?: { eventId: string; fallback?: { body: string; html: string } };
  /** Send into a thread. Without replyTo, m.in_reply_to points at `latestId` as the fallback for clients without threads. */
  thread?: { rootId: string; latestId: string };
  extra?: Record<`work.pasodrum.${string}`, unknown>;
}

const HTML = 'org.matrix.custom.html';
const formatted = (html: string | undefined) => (html ? { format: HTML, formatted_body: html } : {});

export function contentOf(message: TextMessage): Record<string, unknown> {
  const { body, html, file, replyTo, mentions, thread } = message;
  const fallback = replyTo?.fallback;
  const relation = thread
    ? { rel_type: RelationType.Thread, event_id: thread.rootId, is_falling_back: !replyTo, 'm.in_reply_to': { event_id: replyTo?.eventId ?? thread.latestId } }
    : replyTo && { 'm.in_reply_to': { event_id: replyTo.eventId } };
  return {
    ...message.extra,
    msgtype: message.msgtype ?? 'm.text',
    body: (fallback?.body ?? '') + body,
    ...formatted(fallback ? fallback.html + (html ?? escapeHtml(body)) : html),
    ...(file ? { ...(file.sealed ? { file: file.sealed } : { url: file.url }), filename: body, info: file.info } : {}),
    ...(mentions ? { 'm.mentions': { user_ids: mentions } } : {}),
    ...(relation ? { 'm.relates_to': relation } : {}),
  };
}

/** m.replace: `* ` text fallback for old clients, full new content in m.new_content; top-level m.mentions only notifies the newly mentioned. */
export function editContentOf(eventId: string, message: TextMessage, newlyMentioned: string[]): Record<string, unknown> {
  const { body, html } = message;
  const msgtype = message.msgtype ?? 'm.text';
  return {
    msgtype,
    body: `* ${body}`,
    ...formatted(html && `* ${html}`),
    'm.new_content': { msgtype, body, ...formatted(html), 'm.mentions': { user_ids: message.mentions ?? [] } },
    'm.mentions': { user_ids: newlyMentioned },
    'm.relates_to': { rel_type: RelationType.Replace, event_id: eventId },
  };
}

type MessageContent = TimelineEvents[EventType.RoomMessage];

export function send(client: MatrixClient, roomId: string, message: TextMessage) {
  return client.sendEvent(roomId, EventType.RoomMessage, contentOf(message) as unknown as MessageContent);
}

export function sendEdit(client: MatrixClient, roomId: string, eventId: string, message: TextMessage, newlyMentioned: string[]) {
  return client.sendEvent(roomId, EventType.RoomMessage, editContentOf(eventId, message, newlyMentioned) as unknown as MessageContent);
}

export function sendReaction(client: MatrixClient, roomId: string, eventId: string, key: string) {
  return client.sendEvent(roomId, EventType.Reaction, { 'm.relates_to': { rel_type: RelationType.Annotation, event_id: eventId, key } });
}
