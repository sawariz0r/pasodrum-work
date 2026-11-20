import { describe, expect, it } from 'vitest';
import { contentOf, editContentOf } from './send';

describe('contentOf (D-05)', () => {
  it('always carries body; formatted_body only with html; m.mentions when given', () => {
    expect(contentOf({ body: 'hi' })).toEqual({ msgtype: 'm.text', body: 'hi' });
    expect(contentOf({ body: 'hi Ingrid', html: 'hi <a href="https://matrix.to/#/@i:s">Ingrid</a>', mentions: ['@i:s'], extra: { 'work.pasodrum.x': 1 } })).toEqual({
      'work.pasodrum.x': 1,
      msgtype: 'm.text',
      body: 'hi Ingrid',
      format: 'org.matrix.custom.html',
      formatted_body: 'hi <a href="https://matrix.to/#/@i:s">Ingrid</a>',
      'm.mentions': { user_ids: ['@i:s'] },
    });
  });

  it('prepends the reply fallback and adds the relation', () => {
    const c = contentOf({ body: 'yes <ok>', replyTo: { eventId: '$e', fallback: { body: '> <@a:s> q\n\n', html: '<mx-reply>q</mx-reply>' } } });
    expect(c).toMatchObject({
      body: '> <@a:s> q\n\nyes <ok>',
      formatted_body: '<mx-reply>q</mx-reply>yes &lt;ok&gt;',
      'm.relates_to': { 'm.in_reply_to': { event_id: '$e' } },
    });
    expect(contentOf({ body: 'x', replyTo: { eventId: '$e' } })).toEqual({ msgtype: 'm.text', body: 'x', 'm.relates_to': { 'm.in_reply_to': { event_id: '$e' } } });
  });

  it('sends into a thread with the Element-style reply fallback, or as a real reply inside the thread', () => {
    expect(contentOf({ body: 'x', thread: { rootId: '$root', latestId: '$last' } })).toEqual({
      msgtype: 'm.text',
      body: 'x',
      'm.relates_to': { rel_type: 'm.thread', event_id: '$root', is_falling_back: true, 'm.in_reply_to': { event_id: '$last' } },
    });
    expect(contentOf({ body: 'x', thread: { rootId: '$root', latestId: '$last' }, replyTo: { eventId: '$q' } })['m.relates_to']).toEqual({
      rel_type: 'm.thread',
      event_id: '$root',
      is_falling_back: false,
      'm.in_reply_to': { event_id: '$q' },
    });
  });

  it('builds media messages', () => {
    expect(contentOf({ msgtype: 'm.image', body: 'a.png', file: { url: 'mxc://s/id', info: { mimetype: 'image/png', size: 3, w: 2, h: 1 } } })).toEqual({
      msgtype: 'm.image',
      body: 'a.png',
      filename: 'a.png',
      url: 'mxc://s/id',
      info: { mimetype: 'image/png', size: 3, w: 2, h: 1 },
    });
  });
});

describe('editContentOf', () => {
  it('sends m.replace with full new content and a * fallback', () => {
    expect(editContentOf('$e', { body: 'new', html: '<b>new</b>', mentions: ['@a:s', '@b:s'] }, ['@b:s'])).toEqual({
      msgtype: 'm.text',
      body: '* new',
      format: 'org.matrix.custom.html',
      formatted_body: '* <b>new</b>',
      'm.new_content': { msgtype: 'm.text', body: 'new', format: 'org.matrix.custom.html', formatted_body: '<b>new</b>', 'm.mentions': { user_ids: ['@a:s', '@b:s'] } },
      'm.mentions': { user_ids: ['@b:s'] },
      'm.relates_to': { rel_type: 'm.replace', event_id: '$e' },
    });
  });
});
