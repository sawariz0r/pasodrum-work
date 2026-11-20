import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type ConnectionState } from '../../matrix';
import { Banner, type BannerProps } from '../../ui';

const restoredMs = 2000;
const leaveMs = 240;

export function ConnectionBanner() {
  const { t } = useTranslation();
  const store = useStore();
  const connection = useWorkspace((x) => x.connection);
  const [prev, setPrev] = useState<ConnectionState>(connection);
  const [restored, setRestored] = useState(false);

  if (prev !== connection) {
    setPrev(connection);
    setRestored(connection === 'online' && (prev === 'offline' || prev === 'reconnecting'));
  }

  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => setRestored(false), restoredMs);
    return () => clearTimeout(timer);
  }, [restored]);

  const status: BannerProps['status'] | null =
    connection === 'offline' || connection === 'reconnecting' ? connection : restored ? 'restored' : null;
  const [shown, setShown] = useState(status);
  if (status && status !== shown) setShown(status);

  useEffect(() => {
    if (status) return;
    const timer = setTimeout(() => setShown(null), leaveMs);
    return () => clearTimeout(timer);
  }, [status]);

  const leaving = !status;
  if (shown === 'offline') return <Banner status="offline" text={t('shell.connection.offline')} leaving={leaving} />;
  if (shown === 'reconnecting')
    return (
      <Banner
        status="reconnecting"
        text={t('shell.connection.reconnecting')}
        actionLabel={t('shell.connection.tryNow')}
        onAction={() => store.reconnectNow()}
        leaving={leaving}
      />
    );
  if (shown === 'restored') return <Banner status="restored" text={t('shell.connection.backOnline')} leaving={leaving} />;
  return null;
}
