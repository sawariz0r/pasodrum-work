import { EventType, MsgType, type MatrixClient } from 'matrix-js-sdk';

/** D-05: everything we send reads fully in a standard client; our data rides as extra work.pasodrum.* keys. */
export interface TextMessage {
  body: string;
  html?: string;
  extra?: Record<`work.pasodrum.${string}`, unknown>;
}

export function send(client: MatrixClient, roomId: string, message: TextMessage) {
  return client.sendEvent(roomId, EventType.RoomMessage, {
    ...message.extra,
    msgtype: MsgType.Text,
    body: message.body,
    ...(message.html ? { format: 'org.matrix.custom.html', formatted_body: message.html } : {}),
  });
}
