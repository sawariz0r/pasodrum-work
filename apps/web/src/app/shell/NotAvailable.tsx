import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useWorkspace } from '../../matrix';
import { Button } from '../../ui';
import { HashIcon, UnlinkIcon } from '../icons';
import { channelPath, homeChannel } from '../places';
import s from './Shell.module.css';

export function NotAvailable() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spaces = useWorkspace((x) => x.spaces);
  const channels = useWorkspace((x) => x.channels);
  const home = homeChannel({ spaces, channels });

  return (
    <div className={s.unavailable}>
      <div className={s.unavailableIcon}>
        <UnlinkIcon />
      </div>
      <h1>{t('shell.notAvailable.title')}</h1>
      {home && (
        <Button className={s.unavailableAction} icon={<HashIcon />} onClick={() => navigate(channelPath(home.spaceId, home.id))}>
          {t('shell.notAvailable.openChannel', { channel: home.name })}
        </Button>
      )}
    </div>
  );
}
