import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type Channel } from '../../matrix';
import { channelPath } from '../places';
import { rememberPlace } from '../prefs';

// First sign-in after joining (FirstRunTeam, FirstRunClient): open the channel you were added to, with everything
// before you joined counted as read. No tour, no helper text (RulesM4 → First run).
let pending: { userId: string; spaceName: string } | null = null;

export function startFirstRun(userId: string, spaceName: string) {
  pending = { userId, spaceName };
}

function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function FirstRun() {
  const store = useStore();
  const navigate = useNavigate();
  // Our app accepts the space and channel after the first sync, so wait until a channel in that space shows up.
  const target = useWorkspace((x): Channel | undefined => {
    if (!pending || pending.userId !== x.me.id || x.connection === 'starting') return undefined;
    const space = x.spaces.find((sp) => sp.name === pending!.spaceName);
    return space ? x.channels[space.id]?.[0] : undefined;
  });

  useEffect(() => {
    if (!target) return;
    pending = null;
    const x = store.getSnapshot();
    for (const c of Object.values(x.channels).flat()) if (c.unread || c.mentions) store.markRead(c.id);
    for (const d of x.dms) if (d.unread || d.mentions) store.markRead(d.id);
    for (const a of x.activity) if (a.unread) store.markActivityRead(a.id);
    const timeZone = deviceTimeZone();
    if (timeZone) void store.updateProfile({ timeZone }).catch(() => {});
    // "/" resolves to the last place too, so whichever navigation runs last lands here.
    rememberPlace(target.spaceId, target.id);
    navigate(channelPath(target.spaceId, target.id), { replace: true });
  }, [target, store, navigate]);

  return null;
}
