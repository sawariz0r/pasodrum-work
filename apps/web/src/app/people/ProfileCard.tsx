// The profile card (Batch C ProfileCard): name, local time, work email, Message. Never the ID.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type Profile } from '../../matrix';
import { Button } from '../../ui';
import { dmPath } from '../places';
import { BubbleIcon, ClockIcon, MailIcon } from '../shell/icons';
import { Face } from './Face';
import { useLocalTime } from './localTime';
import { ProfileCardContext, type ProfileCardApi } from './ProfileCardContext';
import s from './People.module.css';

type Open = { userId: string; anchor: HTMLElement; profile?: Profile };

const WIDTH = 296;
const GAP = 6;
const EDGE = 8;

export function ProfileCardProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [open, setOpen] = useState<Open | null>(null);
  const seq = useRef(0);
  const anchorRef = useRef<HTMLElement | null>(null);

  const api = useMemo<ProfileCardApi>(
    () => ({
      open(userId, anchor) {
        const n = ++seq.current;
        anchorRef.current = anchor;
        setOpen({ userId, anchor });
        store.profile(userId).then(
          (profile) => {
            if (n === seq.current) setOpen((o) => (o && o.userId === userId ? { ...o, profile } : o));
          },
          () => {
            if (n === seq.current) setOpen(null);
          },
        );
      },
    }),
    [store],
  );

  const close = useCallback(() => {
    seq.current++;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    setOpen(null);
    if (anchor?.isConnected) anchor.focus();
  }, []);

  return (
    <ProfileCardContext.Provider value={api}>
      {children}
      {open?.profile && createPortal(<Card key={open.userId} profile={open.profile} anchor={open.anchor} onClose={close} />, document.body)}
    </ProfileCardContext.Provider>
  );
}

function Card({ profile, anchor, onClose }: { profile: Profile; anchor: HTMLElement; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const meId = useWorkspace((x) => x.me.id);
  const ref = useRef<HTMLDivElement>(null);
  const [now] = useState(() => new Date());
  const local = useLocalTime(profile.timeZone, now);
  const [first] = useState(() => place(anchor, 0));
  const { person, email } = profile;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const p = place(anchor, el.offsetHeight);
    Object.assign(el.style, { left: `${p.left}px`, top: `${p.top}px`, transformOrigin: p.origin });
    el.focus();
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);

  const message = async () => {
    const id = await store.openDm([person.id]);
    onClose();
    navigate(dmPath(id));
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('people.profile', { name: person.name })}
      tabIndex={-1}
      className={s.card}
      style={{ left: first.left, top: first.top, transformOrigin: first.origin }}
    >
      <Face person={person} size={72} />
      <h2 className={s.cardName}>{person.name}</h2>
      {(local || email) && (
        <div className={s.cardFacts}>
          {local && (
            <span className={s.fact}>
              <ClockIcon />
              <span>{local}</span>
            </span>
          )}
          {email && (
            <span className={s.fact}>
              <MailIcon />
              <span>{email}</span>
            </span>
          )}
        </div>
      )}
      {person.id !== meId && (
        <Button block className={s.cardAction} icon={<BubbleIcon size={16} strokeWidth={2} />} onClick={() => void message()}>
          {t('people.message')}
        </Button>
      )}
    </div>
  );
}

/** Below the name, left-aligned; above it when there's no room; always inside the window. */
function place(anchor: HTMLElement, height: number) {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - WIDTH - EDGE));
  const below = r.bottom + GAP;
  if (height && below + height > window.innerHeight - EDGE && r.top - GAP - height >= EDGE) {
    return { left, top: r.top - GAP - height, origin: '0 100%' };
  }
  return { left, top: below, origin: '0 0' };
}
