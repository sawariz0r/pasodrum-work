// Browse channels (BrowseChannels): every channel in the space you're in; private ones only if the server shows them.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useStore, type JoinableChannel, type Space } from '../../matrix';
import { HashIcon, LockIcon } from '../icons';
import { channelPath } from '../places';
import { DrawerToggle } from '../shell/Drawer';
import { SearchIcon } from '../shell/icons';
import s from './Channels.module.css';
import { useChannels } from './ChannelsProvider';
import { CheckIcon, PlusIcon, UsersIcon } from './icons';
import { canCreateIn } from './roles';
import { useRole } from './shared';

export function BrowseChannels({ space }: { space: Space }) {
  const { t } = useTranslation();
  const store = useStore();
  const channels = useChannels();
  const role = useRole(space.id);
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
    } finally {
      setJoining((j) => ({ ...j, [c.id]: false }));
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q ? list.filter((c) => c.name.toLowerCase().includes(q) || c.topic?.toLowerCase().includes(q)) : list;

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
      </header>
      <div className={s.search}>
        <label className={s.searchField}>
          <SearchIcon />
          <input type="search" aria-label={t('channels.search')} placeholder={t('channels.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <ul className={s.list} aria-label={t('channels.title')}>
        {shown.map((c) => (
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
            <span role="img" className={s.count} aria-label={t('channels.memberCount', { count: c.memberCount })}>
              <UsersIcon />
              {c.memberCount}
            </span>
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
      </ul>
    </div>
  );
}
