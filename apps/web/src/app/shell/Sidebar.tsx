import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWorkspace, type Channel, type Space } from '../../matrix';
import { Badge } from '../../ui';
import { HashIcon, LockIcon } from '../icons';
import { channelPath } from '../places';
import s from './Shell.module.css';

const none: Channel[] = [];

export function Sidebar({ space, activeChannelId, onNavigate }: { space: Space; activeChannelId?: string; onNavigate: () => void }) {
  const { t } = useTranslation();
  const channels = useWorkspace((x) => x.channels[space.id] ?? none);

  return (
    <aside aria-label={t('shell.sidebar.label', { workspace: space.name })} className={s.sidebar}>
      <div className={s.sideHead}>
        <h2 className={s.spaceName}>{space.name}</h2>
      </div>
      <div className={s.sideList}>
        <div className={s.sectionLabel}>{t('shell.sidebar.channels')}</div>
        {channels.map((c) => {
          const active = c.id === activeChannelId;
          const strong = !active && (c.unread > 0 || c.mentions > 0);
          return (
            <Link
              key={c.id}
              to={channelPath(space.id, c.id)}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={[s.row, strong && s.strong].filter(Boolean).join(' ')}
            >
              {c.private ? <LockIcon /> : <HashIcon />}
              <span className={s.rowName}>{c.name}</span>
              {!active && <Badge count={c.mentions} />}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
