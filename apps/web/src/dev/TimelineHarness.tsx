// Dev-only: /dev/timeline renders ChannelView on the fake store. ?theme=dark&lang=ja&ch=!long&loadMs=1500
import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter } from 'react-router';
import { setLanguage } from '../app/i18n';
import { createFakeStore } from '../app/testing/fakeStore';
import { ChannelView } from '../app/timeline/ChannelView';
import { WorkspaceProvider, type Message, type WorkspaceStore } from '../matrix';
import { Button } from '../ui';

const senders = [
  { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' },
  { id: '@ingrid:pasodrum.localhost', name: 'Ingrid Holm' },
  { id: '@tanaka:pasodrum.localhost', name: '田中 由紀' },
  { id: '@sofia:pasodrum.localhost', name: 'Sofia Olsen' },
];
const lines = [
  'Staging is green. Cold start on the desktop app is down to 1.2s.',
  'Nice. Pushing notifications to next week so Add people ships first.',
  'ステージングは問題なし。同期の書き直しで、コールドスタートが 1.2 秒まで縮みました。',
  'Spec is here: https://pasodrum.work/docs/spec (see section 4).',
  'Two lines:\nfirst, then second.',
];

function page(n: number, newest: number): Message[] {
  return Array.from({ length: n }, (_, i) => {
    const k = newest - (n - 1 - i);
    return {
      id: `$long-${k}`, channelId: '!long', sender: senders[Math.abs(Math.floor(k / 2)) % senders.length]!,
      body: `${lines[Math.abs(k) % lines.length]!} (${k})`, ts: Date.now() - (200 - k) * 47 * 60_000, status: 'sent' as const,
    };
  });
}

function makeStore(loadMs: number): WorkspaceStore {
  const base = createFakeStore({ loadMs });
  const snap = base.getSnapshot();
  base.set({ channels: { ...snap.channels, '!pasodrum': [...snap.channels['!pasodrum']!, { id: '!long', spaceId: '!pasodrum', name: 'long', private: false, unread: 9, mentions: 0, memberCount: 4 }] } });
  let oldest = 161;
  const patch = (next: object) => {
    const s = base.getSnapshot();
    base.set({ timelines: { ...s.timelines, '!long': { ...s.timelines['!long']!, ...next } } });
  };
  return {
    ...base,
    openTimeline(id) {
      if (id !== '!long' || base.getSnapshot().timelines[id]) return base.openTimeline(id);
      base.set({ timelines: { ...base.getSnapshot().timelines, '!long': { messages: [], initialLoading: true, loadingOlder: false, hasOlder: true } } });
      setTimeout(() => patch({ messages: page(40, 200), initialLoading: false }), loadMs);
    },
    loadOlder(id) {
      if (id !== '!long') return base.loadOlder(id);
      patch({ loadingOlder: true });
      setTimeout(() => {
        const older = page(30, oldest - 1);
        oldest -= 30;
        patch({ messages: [...older, ...base.getSnapshot().timelines['!long']!.messages], loadingOlder: false, hasOlder: oldest > 80 });
      }, 1200);
    },
  };
}

function incoming(store: WorkspaceStore, channelId: string) {
  const s = store.getSnapshot();
  const tl = s.timelines[channelId];
  if (!tl) return;
  const n = tl.messages.length;
  const m: Message = { id: `$in-${Date.now()}`, channelId, sender: senders[n % senders.length]!, body: lines[n % lines.length]!, ts: Date.now(), status: 'sent' };
  (store as ReturnType<typeof createFakeStore>).set({ timelines: { ...s.timelines, [channelId]: { ...tl, messages: [...tl.messages, m] } } });
}

const param = (k: string, d: string) => new URLSearchParams(location.search).get(k) ?? d;

export default function TimelineHarness() {
  const [theme, setTheme] = useState(() => param('theme', 'light'));
  const [lang, setLang] = useState(() => (param('lang', 'en') === 'ja' ? 'ja' : 'en'));
  const [channel, setChannel] = useState(() => param('ch', '!general'));
  const store = useMemo(() => makeStore(Number(param('loadMs', '900'))), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void setLanguage(lang as 'en' | 'ja');
    const q = new URLSearchParams(location.search);
    q.set('theme', theme);
    q.set('lang', lang);
    q.set('ch', channel);
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }, [theme, lang, channel]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid var(--line)', background: 'var(--side)' }}>
        {['!general', '!design', '!eng', '!long'].map((id) => (
          <Button key={id} variant={id === channel ? 'primary' : 'secondary'} onClick={() => setChannel(id)}>{id}</Button>
        ))}
        <Button variant="ghost" onClick={() => incoming(store, channel)}>+ incoming</Button>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? 'Dark' : 'Light'}</Button>
        <Button variant="secondary" onClick={() => setLang(lang === 'en' ? 'ja' : 'en')}>{lang === 'en' ? '日本語' : 'English'}</Button>
      </div>
      <div style={{ height: 96, flexShrink: 0, borderBottom: '1px solid var(--line)' }} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <BrowserRouter>
          <WorkspaceProvider store={store}>
            <ChannelView channelId={channel} />
          </WorkspaceProvider>
        </BrowserRouter>
      </div>
    </div>
  );
}
