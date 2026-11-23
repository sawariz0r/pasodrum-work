// Browse channels (BrowseChannels, BrowseArchived): every channel in the space you're in; private ones only if the server shows them.
// Archived channels come last under Archived; their row opens the channel read-only.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useStore, useWorkspace, type Channel, type JoinableChannel, type Space } from '../../matrix';
import { HashIcon, LockIcon } from '../icons';
import { channelPath } from '../places';
import { DrawerToggle } from '../shell/Drawer';
import { HeaderEnd } from '../shell/HeaderEnd';
import { SearchIcon } from '../shell/icons';
import s from './Channels.module.css';
import { useChannels } from './ChannelsProvider';
import { ArchiveIcon, CheckIcon, PlusIcon, UsersIcon } from './icons';
import { canCreateIn } from './roles';
import { useToast } from '../toast';
import { useRole } from './shared';

const noChannels: Channel[] = [];

export function BrowseChannels({ space }: { space: Space }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const mine = useWorkspace((x) => x.channels[space.id] ?? noChannels);
  const channels = useChannels();
  const role = useRole(space.id);
  const toast = useToast();
  const [list, setList] = useState<JoinableChannel[]>([]);
  const [query, setQuery] = useState('');
  const [joining, setJoining] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    store.browseChannels(space.id).then(
      (all) => live && setList([...all].sort((a, b) => a.name.localeCompare(b.name))),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, space.id]);

  const join = async (c: JoinableChannel) => {
    setJoining((j) => ({ ...j, [c.id]: true }));
    try {
      await store.joinChannel(c.id);
      setList((l) => l.map((x) => (x.id === c.id ? { ...x, joined: true, memberCount: x.memberCount + 1 } : x)));
    } catch {
      // Stays joinable; the button is the retry.
      toast(t('failed.join', { name: c.name }));
    } finally {
      setJoining((j) => ({ ...j, [c.id]: false }));
    }
  };

  const open = async (c: JoinableChannel) => {
    if (!c.joined) await store.joinChannel(c.id);
    navigate(channelPath(space.id, c.id));
  };

  // Channels I'm in follow the snapshot (renamed, archived or unarchived since the list loaded).
  const live = list.map((c) => {
    const m = mine.find((x) => x.id === c.id);
    return m ? { ...c, name: m.name, archived: !!m.archived } : c;
  });
  const q = query.trim().toLowerCase();
  const shown = (q ? live.filter((c) => c.name.toLowerCase().includes(q) || c.topic?.toLowerCase().includes(q)) : live).sort((a, b) => a.name.localeCompare(b.name));
  const archived = shown.filter((c) => c.archived);
  const count = (c: JoinableChannel) => (
    <span role="img" className={s.count} aria-label={t('channels.memberCount', { count: c.memberCount })}>
      <UsersIcon />
      {c.memberCount}
    </span>
  );

  return (
    <div className={s.page}>
      <header className={s.pageHead}>
        <DrawerToggle />
        <HashIcon size={18} strokeWidth={2.1} />
        <h1 className={s.pageTitle}>{t('channels.title')}</h1>
        {canCreateIn(role) && (
          <button type="button" className={s.smallButton} onClick={() => channels.newChannel(space.id)}>
            <PlusIcon size={15} />
            {t('channels.newChannel')}
          </button>
        )}
        <HeaderEnd />
      </header>
      <div className={s.search}>
        <label className={s.searchField}>
          <SearchIcon />
          <input type="search" aria-label={t('channels.search')} placeholder={t('channels.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <ul className={s.list} aria-label={t('channels.title')}>
        {shown.filter((c) => !c.archived).map((c) => (
          <li key={c.id} className={s.browseRow}>
            <span className={s.browseIcon}>{c.private ? <LockIcon size={17} strokeWidth={2} /> : <HashIcon size={17} strokeWidth={2} />}</span>
            <span className={s.browseText}>
              {c.joined ? (
                <Link to={channelPath(space.id, c.id)} className={s.browseName}>
                  {c.name}
                </Link>
              ) : (
                <span className={s.browseName}>{c.name}</span>
              )}
              {c.topic && <span className={s.browseTopic}>{c.topic}</span>}
            </span>
            {count(c)}
            <span className={s.joinCell}>
              {c.joined ? (
                <span className={s.joined}>
                  <CheckIcon />
                  {t('channels.joined')}
                </span>
              ) : (
                <button type="button" className={s.joinButton} disabled={joining[c.id]} aria-label={t('channels.joinName', { name: c.name })} onClick={() => void join(c)}>
                  {t('channels.join')}
                </button>
              )}
            </span>
          </li>
        ))}
        {archived.length > 0 && (
          <li className={s.archivedLabel} key="archived">
            {t('channels.archivedGroup')}
          </li>
        )}
        {archived.map((c) => (
          <li key={c.id} className={`${s.browseRow} ${s.archivedRow}`}>
            <span className={`${s.browseIcon} ${s.browseIconArchived}`}>
              <ArchiveIcon />
            </span>
            <span className={s.browseText}>
              <button type="button" className={`${s.browseName} ${s.browseNameArchived}`} onClick={() => void open(c).catch(() => toast(t('failed.open', { name: c.name })))}>
                {c.name}
              </button>
              {c.topic && <span className={s.browseTopic}>{c.topic}</span>}
            </span>
            {count(c)}
            <span className={s.joinCell}>
              {mine.find((x) => x.id === c.id)?.manageable && (
                <button type="button" className={s.joinButton} onClick={() => void store.setChannelArchived(c.id, false).catch(() => toast(t('failed.unarchive', { name: c.name })))}>
                  {t('channels.unarchive')}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
