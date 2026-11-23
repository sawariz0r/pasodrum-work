// The hooks the shell calls: the spark, the ⌘K row, ⌘J, screens reporting what they show, and "Ask about this".
import { useEffect, useId } from 'react';
import type { AssistantSlot, ScreenContext } from '../../app/registry';
import { useRightPanelState } from '../../app/rightPanel';
import { useOpenThread } from '../../app/thread/useThread';
import { useWorkspace, type Message, type WorkspaceSnapshot } from '../../matrix';
import { useOffered, useSubmit } from './hooks';
import { SparkIcon } from './icons';
import { open, reportScreen, select, toggle, useAssistant } from './session';
import { useT } from './strings';
import { Panel } from './Panel';

/** Whether ⌘J may open the panel: kept by the spark, which every page header draws. */
let offeredNow = false;

/** Open and on top, or nothing under it (as the shell decides; importing the shell from here would loop through the registry). */
function useShown(): boolean {
  const { assistant, top } = useRightPanelState();
  const thread = useOpenThread() !== null;
  return assistant && (top === 'assistant' || !thread);
}

function useHeaderButton() {
  const { t } = useT();
  const offered = useOffered();
  const shown = useShown();
  const me = useWorkspace((s) => s.me.id);
  const dot = useAssistant((s) => s.session.user === me && s.session.dot);
  useEffect(() => {
    offeredNow = offered;
  }, [offered]);
  if (!offered) return null;
  return { icon: <SparkIcon />, label: dot && !shown ? t('assistantNew') : t('assistant'), pressed: shown, dot: dot && !shown, run: toggle };
}

function useSwitcherRow(query: string) {
  const { t } = useT();
  const offered = useOffered();
  const submit = useSubmit();
  const q = query.trim();
  if (!offered || !q) return null;
  return {
    icon: <SparkIcon size={16} />,
    label: t('askAssistant', { query: q }),
    hint: t('shortcut'),
    run: () => {
      open();
      submit(q);
    },
  };
}

function useScreen(ctx: ScreenContext | null) {
  const id = useId();
  useEffect(() => {
    reportScreen(id, ctx);
    return () => reportScreen(id, null);
  }, [id, ctx]);
}

const plainKinds = new Set(['system', 'deleted', 'undecryptable']);
const openChannel = (s: WorkspaceSnapshot, room: string) => {
  const ch = Object.values(s.channels).flat().find((c) => c.id === room);
  return !!ch && !ch.encrypted;
};

/** The hover bar's spark: this message becomes what the next ask is about. Not in encrypted conversations or DMs. */
export function useAskAboutThis(m: Message) {
  const { t } = useT();
  const offered = useOffered();
  const me = useWorkspace((s) => s.me.id);
  const ok = useWorkspace((s) => openChannel(s, m.channelId));
  if (!offered || !ok || m.status !== 'sent' || plainKinds.has(m.kind ?? 'text')) return null;
  return {
    icon: <SparkIcon size={16} />,
    label: t('askAboutThis'),
    run: () => {
      select(me, { ref: { k: 'message', room: m.channelId, event: m.id }, name: m.sender.name, ts: m.ts });
      open();
    },
  };
}

export const assistantSlot: AssistantSlot = {
  Panel,
  useHeaderButton,
  useSwitcherRow,
  useScreen,
  toggle: () => {
    if (offeredNow) toggle();
  },
};
