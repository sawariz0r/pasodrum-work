// One place that opens the Batch D dialogs: New channel, Add people, channel details (and Leave from there).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { AddPeopleDialog } from './AddPeople';
import { ChannelDetailsDialog, type DetailsTab } from './ChannelDetails';
import { CreateChannelDialog } from './CreateChannel';

export interface ChannelsApi {
  newChannel(spaceId: string): void;
  addPeople(channelId: string): void;
  details(channelId: string, tab?: DetailsTab): void;
}

const ChannelsContext = createContext<ChannelsApi>({ newChannel() {}, addPeople() {}, details() {} });

export function useChannels(): ChannelsApi {
  return useContext(ChannelsContext);
}

type Sheet = { kind: 'create'; spaceId: string } | { kind: 'add'; channelId: string } | { kind: 'details'; channelId: string; tab: DetailsTab };

export function ChannelsProvider({ children }: { children: ReactNode }) {
  // A fresh dialog each time one opens (`n`); `open: false` keeps the last one mounted for its exit animation.
  const [state, setState] = useState<{ n: number; open: boolean; sheet?: Sheet }>({ n: 0, open: false });
  const api = useMemo<ChannelsApi>(() => {
    const show = (sheet: Sheet) => setState((st) => ({ n: st.n + 1, open: true, sheet }));
    return {
      newChannel: (spaceId) => show({ kind: 'create', spaceId }),
      addPeople: (channelId) => show({ kind: 'add', channelId }),
      details: (channelId, tab = 'about') => show({ kind: 'details', channelId, tab }),
    };
  }, []);
  const close = () => setState((st) => ({ ...st, open: false }));
  const { sheet, open, n } = state;

  return (
    <ChannelsContext.Provider value={api}>
      {children}
      {sheet?.kind === 'create' && <CreateChannelDialog key={n} open={open} spaceId={sheet.spaceId} onClose={close} />}
      {sheet?.kind === 'add' && <AddPeopleDialog key={n} open={open} channelId={sheet.channelId} onClose={close} />}
      {sheet?.kind === 'details' && (
        <ChannelDetailsDialog key={n} open={open} channelId={sheet.channelId} tab={sheet.tab} onClose={close} onAddPeople={() => api.addPeople(sheet.channelId)} />
      )}
    </ChannelsContext.Provider>
  );
}
