import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ChannelView } from '../timeline/ChannelView';
import { ChatIcon } from '../icons';
import { visibleTabs, type ChannelTabType, type StoredTab } from '../registry';
import { useRegistry } from '../RegistryProvider';
import s from './Shell.module.css';

const messages = 'messages';

/** Messages, the built-in tabs (Pins, Files), then stored tabs whose feature is registered. The open tab is `?tab=<id>`;
 * a tab's jump opens Messages with `?msg=<id>`, which the timeline scrolls to and flashes. */
export function ChannelTabs({ channelId, stored }: { channelId: string; stored: readonly StoredTab[] }) {
  const { t } = useTranslation();
  const registry = useRegistry();
  const [params, setParams] = useSearchParams();
  const tabs = visibleTabs(stored, registry);
  const open = tabs.find((x) => x.id === params.get('tab'));
  // The panel fades in when you switch tabs, not when the conversation first opens.
  const [switched, setSwitched] = useState(false);

  const select = (id: string, messageId?: string) => {
    if (id !== (open?.id ?? messages)) setSwitched(true);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === messages) next.delete('tab');
        else next.set('tab', id);
        if (messageId) next.set('msg', messageId);
        else next.delete('msg');
        return next;
      },
      { replace: true },
    );
  };
  const jumpTo = (messageId: string) => select(messages, messageId);

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
      <div key={open?.id ?? messages} role="tabpanel" className={switched ? `${s.panel} ${s.panelIn}` : s.panel}>
        {open ? <open.tab.View channelId={channelId} jumpTo={jumpTo} /> : <ChannelView channelId={channelId} />}
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
