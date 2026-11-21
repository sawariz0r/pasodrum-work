import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { matchPath, useHref, useLocation } from 'react-router';
import { useStore, useWorkspace, type WorkspaceSnapshot } from '../../matrix';
import { ChatIcon, HashIcon, LinkIcon, LockIcon, LogoMark } from '../icons';
import { useDmName } from '../people/names';
import { homeChannel } from '../places';
import j from '../join/Join.module.css';
import { CopiedLive, useCopied } from './AccountPair';
import { elementXLink } from './elementX';
import { CheckIcon, CopyIcon, LaptopIcon, OpenOutIcon } from './icons';
import s from './Another.module.css';

type Place = { icon: ReactNode; label: string };

/** An app link opened on a phone (PhoneHandoff, PhoneHandoffJP): what it points to, Copy link, Open in Element X. */
export function PhoneHandoff({ place, server, to }: { place: Place; server: string; to: string }) {
  const { t } = useTranslation();
  const [copied, copy, count] = useCopied<'link'>();
  const link = window.location.origin + useHref(to);
  return (
    <div className={j.page}>
      <header className={j.header}>
        <span className={j.logo}>
          <LogoMark size={17} />
        </span>
        <span className={j.wordmark}>
          {t('common.brand')} <span>{t('common.brandSuffix')}</span>
        </span>
      </header>
      <main className={j.main}>
        <div className={j.card}>
          <div className={j.head}>
            <span className={s.laptop}>
              <LaptopIcon />
            </span>
            <h1 className={j.title}>{t('another.onComputer')}</h1>
          </div>
          <div className={s.phoneBody}>
            <div className={s.place}>
              <span className={s.placeIcon}>{place.icon}</span>
              <span className={s.placeLabel}>{place.label}</span>
              <button
                type="button"
                className={s.copyLink}
                data-copied={copied ? '' : undefined}
                aria-label={t('another.copyLink')}
                onClick={() => copy('link', link)}
              >
                {copied ? (
                  <span key="done" className={s.check}>
                    <CheckIcon />
                  </span>
                ) : (
                  <CopyIcon />
                )}
              </button>
            </div>
            <a className={s.elementX} href={elementXLink(server)}>
              {t('another.openElementX')}
              <OpenOutIcon />
            </a>
            <CopiedLive count={count} />
          </div>
        </div>
      </main>
    </div>
  );
}

const pages = {
  activity: 'shell.rail.activity',
  dms: 'shell.rail.dms',
  threads: 'shell.sidebar.threads',
  drafts: 'shell.sidebar.drafts',
  settings: 'shell.profileMenu.settings',
} as const;

function usePlace(): Place {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const dmName = useDmName();
  const snap = useWorkspace((x) => x);
  const brand: Place = {
    icon: <LinkIcon size={16} />,
    label: `${t('common.brand')} ${t('common.brandSuffix')}`,
  };
  const channelPlace = (id: string | undefined, x: WorkspaceSnapshot): Place | undefined => {
    const c = Object.values(x.channels)
      .flat()
      .find((ch) => ch.id === id);
    return (
      c && {
        icon: c.private ? <LockIcon size={16} /> : <HashIcon />,
        label: c.name,
      }
    );
  };
  const at = (pattern: string) => matchPath(pattern, pathname)?.params;

  const ch = at('/w/:spaceId/c/:channelId');
  if (ch) return channelPlace(ch.channelId, snap) ?? brand;
  const dmId = at('/w/:spaceId/dm/:dmId')?.dmId ?? at('/dms/:dmId')?.dmId;
  if (dmId) {
    const dm = snap.dms.find((d) => d.id === dmId);
    return dm ? { icon: <ChatIcon size={16} strokeWidth={1.9} />, label: dmName(dm) } : brand;
  }
  const space = at('/w/:spaceId/*')?.spaceId;
  if (space) {
    const sp = snap.spaces.find((x) => x.id === space);
    return sp ? { ...brand, label: sp.name } : brand;
  }
  if (pathname === '/') return channelPlace(homeChannel(snap)?.id, snap) ?? brand;
  const page = pages[(pathname.split('/')[1] ?? '') as keyof typeof pages] as (typeof pages)[keyof typeof pages] | undefined;
  return page ? { ...brand, label: t(page) } : brand;
}

/** Signed in: names the channel, DM or space the link points to. */
export function PhoneHandoffSignedIn() {
  const store = useStore();
  const place = usePlace();
  const { pathname, search, hash } = useLocation();
  return <PhoneHandoff place={place} server={store.anotherApp().server} to={pathname + search + hash} />;
}

/** Signed out: nothing to name yet; the link is the page they were headed to. */
export function PhoneHandoffSignedOut({ server, from }: { server: string; from?: string }) {
  const { t } = useTranslation();
  return <PhoneHandoff place={{ icon: <LinkIcon size={16} />, label: `${t('common.brand')} ${t('common.brandSuffix')}` }} server={server} to={from ?? '/'} />;
}
