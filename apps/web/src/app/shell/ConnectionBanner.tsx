import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type ConnectionState } from '../../matrix';
import { Banner } from '../../ui';

const restoredMs = 2000;

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

  if (connection === 'offline') return <Banner status="offline" text={t('shell.connection.offline')} />;
  if (connection === 'reconnecting')
    return (
      <Banner
        status="reconnecting"
        text={t('shell.connection.reconnecting')}
        actionLabel={t('shell.connection.tryNow')}
        onAction={() => store.reconnectNow()}
      />
    );
  if (restored) return <Banner status="restored" text={t('shell.connection.backOnline')} />;
  return null;
}
