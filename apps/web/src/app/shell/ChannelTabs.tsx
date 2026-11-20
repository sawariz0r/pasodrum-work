import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ChannelView } from '../timeline/ChannelView';
import { ChatIcon } from '../icons';
import { visibleTabs, type ChannelTabType, type StoredTab } from '../registry';
import { useRegistry } from '../RegistryProvider';
import s from './Shell.module.css';

const messages = 'messages';

/** Messages + the channel's stored tabs whose feature is registered. The open tab is `?tab=<id>`. */
export function ChannelTabs({ channelId, stored }: { channelId: string; stored: readonly StoredTab[] }) {
  const { t } = useTranslation();
  const registry = useRegistry();
  const [params, setParams] = useSearchParams();
  const tabs = visibleTabs(stored, registry);
  const open = tabs.find((x) => x.id === params.get('tab'));

  const select = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === messages) next.delete('tab');
        else next.set('tab', id);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <div role="tablist" aria-label={t('shell.tabs.label')} className={s.tabs}>
        <button type="button" role="tab" aria-selected={!open} className={s.tab} onClick={() => select(messages)}>
          <ChatIcon />
          {t('shell.tabs.messages')}
        </button>
        {tabs.map(({ id, tab }) => (
          <TabButton key={id} tab={tab} selected={open?.id === id} onSelect={() => select(id)} />
        ))}
      </div>
      <div role="tabpanel" className={s.panel}>
        {open ? <open.tab.View channelId={channelId} /> : <ChannelView channelId={channelId} />}
      </div>
    </>
  );
}

function TabButton({ tab, selected, onSelect }: { tab: ChannelTabType; selected: boolean; onSelect: () => void }) {
  const label = tab.useLabel();
  return (
    <button type="button" role="tab" aria-selected={selected} className={s.tab} onClick={onSelect}>
      {tab.icon}
      {label}
    </button>
  );
}
