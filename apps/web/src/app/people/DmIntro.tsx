// The start of a DM with no messages yet (Batch C DMEmpty): the person, big, and their local time.
import { useEffect, useState, type ReactNode } from 'react';
import { useStore, useWorkspace, type Dm, type Profile } from '../../matrix';
import { ClockIcon } from '../shell/icons';
import { DmFace, Face, others } from './Face';
import { useLocalTime } from './localTime';
import { useDmName } from './names';
import s from './People.module.css';

export function DmIntro({ dm, children }: { dm: Dm; children?: ReactNode }) {
  const store = useStore();
  const meId = useWorkspace((x) => x.me.id);
  const name = useDmName();
  const list = others(dm, meId);
  const single = list.length === 1 ? list[0] : undefined;
  const [profile, setProfile] = useState<Profile>();
  const [now] = useState(() => new Date());
  const local = useLocalTime(profile?.timeZone, now);

  useEffect(() => {
    if (!single) return;
    let live = true;
    store.profile(single.id).then(
      (p) => {
        if (live) setProfile(p);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, single]);

  return (
    <div className={s.intro}>
      {single ? <Face person={single} size={72} /> : <DmFace dm={dm} meId={meId} />}
      <h2 className={s.introName}>{name(dm)}</h2>
      {local && (
        <div className={s.introTime}>
          <ClockIcon />
          <span>{local}</span>
        </div>
      )}
      {children}
    </div>
  );
}
