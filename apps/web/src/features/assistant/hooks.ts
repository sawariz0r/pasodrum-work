// Shared by the panel and the shell's hooks.
import { useCallback, useEffect } from 'react';
import { formatTime } from '../../app/format';
import { useIsTeam } from '../../app/team';
import { useStore, useWorkspace } from '../../matrix';
import { ask, chipOf, ensureStatus, getState, isRunning, sessionOf, setDraft, statusOf, useAssistant, type Chip } from './session';
import { useT, type T } from './strings';

/** On the team, and the status endpoint answered (spec §2.4). */
export function useOffered(): boolean {
  const store = useStore();
  const me = useWorkspace((s) => s.me.id);
  const team = useIsTeam();
  const known = useAssistant((s) => s.status?.user === me && s.status.value !== null);
  useEffect(() => {
    if (team) ensureStatus(store, me);
  }, [store, me, team]);
  return team && known;
}

export function chipLabel(t: T, lang: 'en' | 'ja', chip: Chip | null): string | null {
  if (!chip) return null;
  return chip.kind === 'message' ? t('chipMessage', { name: chip.name, time: formatTime(new Date(chip.ts ?? 0), lang) }) : t('chipChannel', { name: chip.name });
}

/** Sends an ask with the chip as it is now; when the box can't send, the text waits in it. */
export function useSubmit() {
  const store = useStore();
  const me = useWorkspace((s) => s.me.id);
  const offline = useWorkspace((s) => s.connection === 'offline');
  const { t, lang } = useT();
  return useCallback(
    (text: string) => {
      const st = getState();
      const session = sessionOf(st, me);
      const status = statusOf(st, me);
      const limited = session.limit ?? (status && status.ask !== 'ok' ? status.ask : undefined);
      if (offline || limited || isRunning()) return setDraft(me, text);
      const chip = chipOf(session, st.screens);
      ask(store, me, { text, chip, label: chipLabel(t, lang, chip), lang, thoroughOk: status?.thorough === 'ok' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t changes identity every render; lang covers it
    [store, me, offline, lang],
  );
}
