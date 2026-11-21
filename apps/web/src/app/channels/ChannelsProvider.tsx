// One place that opens the Batch D/E dialogs: New channel, Add people, channel details (and Leave from there),
// New client space, Client space settings.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { AddPeopleDialog } from './AddPeople';
import { ChannelDetailsDialog, type DetailsTab } from './ChannelDetails';
import { CreateChannelDialog } from './CreateChannel';
import { NewClientSpaceDialog } from './NewClientSpace';
import { SpaceSettingsDialog, type SpaceTab } from './SpaceSettings';

export interface ChannelsApi {
  newChannel(spaceId: string): void;
  /** A channel, or a space (from the space menu). */
  addPeople(targetId: string): void;
  details(channelId: string, tab?: DetailsTab): void;
  newClientSpace(): void;
  spaceSettings(spaceId: string, tab?: SpaceTab): void;
}

const ChannelsContext = createContext<ChannelsApi>({ newChannel() {}, addPeople() {}, details() {}, newClientSpace() {}, spaceSettings() {} });

export function useChannels(): ChannelsApi {
  return useContext(ChannelsContext);
}

type Sheet =
  | { kind: 'create'; spaceId: string }
  | { kind: 'add'; targetId: string }
  | { kind: 'details'; channelId: string; tab: DetailsTab }
  | { kind: 'newSpace' }
  | { kind: 'space'; spaceId: string; tab: SpaceTab };

export function ChannelsProvider({ children }: { children: ReactNode }) {
  // A fresh dialog each time one opens (`n`); `open: false` keeps the last one mounted for its exit animation.
  const [state, setState] = useState<{ n: number; open: boolean; sheet?: Sheet }>({ n: 0, open: false });
  const api = useMemo<ChannelsApi>(() => {
    const show = (sheet: Sheet) => setState((st) => ({ n: st.n + 1, open: true, sheet }));
    return {
      newChannel: (spaceId) => show({ kind: 'create', spaceId }),
      addPeople: (targetId) => show({ kind: 'add', targetId }),
      details: (channelId, tab = 'about') => show({ kind: 'details', channelId, tab }),
      newClientSpace: () => show({ kind: 'newSpace' }),
      spaceSettings: (spaceId, tab = 'general') => show({ kind: 'space', spaceId, tab }),
    };
  }, []);
  const close = () => setState((st) => ({ ...st, open: false }));
  const { sheet, open, n } = state;

  return (
    <ChannelsContext.Provider value={api}>
      {children}
      {sheet?.kind === 'create' && <CreateChannelDialog key={n} open={open} spaceId={sheet.spaceId} onClose={close} />}
      {sheet?.kind === 'add' && <AddPeopleDialog key={n} open={open} targetId={sheet.targetId} onClose={close} />}
      {sheet?.kind === 'details' && (
        <ChannelDetailsDialog key={n} open={open} channelId={sheet.channelId} tab={sheet.tab} onClose={close} onAddPeople={() => api.addPeople(sheet.channelId)} />
      )}
      {sheet?.kind === 'newSpace' && <NewClientSpaceDialog key={n} open={open} onClose={close} />}
      {sheet?.kind === 'space' && <SpaceSettingsDialog key={n} open={open} spaceId={sheet.spaceId} tab={sheet.tab} onClose={close} onAddPeople={api.addPeople} />}
    </ChannelsContext.Provider>
  );
}
