// The Assistant panel (AssistantRules, AssistantFollow, AssistantStates, Assistant1024, Assistant800; components
// Assistant.dc.html and AssistantBits.dc.html). 400 px beside main, 380 px from 1000 to 1279, the whole screen under 1000.
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { closeAssistant } from '../../app/rightPanel';
import { useStore, useWorkspace } from '../../matrix';
import { IconButton } from '../../ui';
import { TurnView } from './Answer';
import { AskBox } from './AskBox';
import { chipLabel, useOffered, useSubmit } from './hooks';
import { BackIcon, CloseIcon, HashIcon, MessageIcon, SparkIcon, StartOverIcon } from './icons';
import {
  chipOf,
  closed,
  lookCloser,
  opened,
  removeChip,
  reset,
  retry,
  sessionOf,
  setDepth,
  setDraft,
  statusOf,
  stop,
  takeReturnFocus,
  useAssistantState,
} from './session';
import { useT } from './strings';
import c from './Panel.module.css';

export function Panel() {
  const { t, lang } = useT();
  const store = useStore();
  const me = useWorkspace((s) => s.me.id);
  const offline = useWorkspace((s) => s.connection === 'offline');
  const offered = useOffered();
  const st = useAssistantState();
  const submit = useSubmit();
  const session = sessionOf(st, me);
  const status = statusOf(st, me);
  const chip = chipOf(session, st.screens);
  const label = chipLabel(t, lang, chip);
  const limit = session.limit ?? (status && status.ask !== 'ok' ? status.ask : undefined);
  const thoroughOk = status?.thorough === 'ok';
  const running = session.turns.some((x) => x.state === 'working');
  const inputRef = useRef<HTMLInputElement>(null);
  const convo = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    opened(me);
    return closed;
  }, [me]);

  // Opened with focus in the box; closed from inside with focus put back where it was.
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      const back = takeReturnFocus();
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  useEffect(() => {
    if (!offered) closeAssistant();
  }, [offered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      closeAssistant();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const last = session.turns.at(-1);
  useLayoutEffect(() => {
    const el = convo.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.turns.length, last?.state]);

  // Look closer only under the newest quick answer, and only while Thorough is available.
  const closerFor = last?.state === 'answered' && last.answer?.outcome === 'answered' && last.answer.depth === 'quick' && (status?.thorough ?? last.answer.thorough) === 'ok' ? last.id : null;
  const announce = last?.state === 'answered' ? (last.answer?.say ?? '') : '';

  return (
    <aside className={c.panel} aria-label={t('assistant')}>
      <header className={c.header}>
        <IconButton className={c.back} size={30} label={t('back')} icon={<BackIcon />} onClick={closeAssistant} />
        <span className={c.titleSpark} aria-hidden="true">
          <SparkIcon />
        </span>
        <h2 className={c.title}>{t('assistant')}</h2>
        <IconButton label={t('startOver')} icon={<StartOverIcon />} onClick={() => reset(me)} />
        <IconButton className={c.close} label={t('close')} icon={<CloseIcon />} onClick={closeAssistant} />
      </header>
      {chip && label && (
        <div className={c.chipRow}>
          <span className={c.chip}>
            <span className={c.chipIcon}>{chip.kind === 'message' ? <MessageIcon /> : <HashIcon />}</span>
            <span className={c.chipLabel}>{label}</span>
            <button type="button" className={c.chipX} aria-label={t('remove', { label })} onClick={() => removeChip(me, chip)}>
              <CloseIcon size={13} strokeWidth={2.2} />
            </button>
          </span>
        </div>
      )}
      <div className={c.convo} ref={convo}>
        <div className={c.items}>
          {session.turns.map((turn, i) => {
            const prev = session.turns[i - 1];
            const divider = i > 0 && turn.label && turn.label !== prev?.label;
            return (
              <Fragment key={turn.id}>
                {divider && (
                  <div role="separator" aria-label={turn.label!} className={c.divider}>
                    <span />
                    <span className={c.dividerText}>{turn.label}</span>
                    <span />
                  </div>
                )}
                <TurnView turn={turn} closer={closerFor === turn.id} onCloser={() => lookCloser(store, me, turn.id)} onRetry={() => retry(store, me, turn.id)} />
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className={c.sr} aria-live="polite">
        {announce}
      </div>
      {limit && (
        <div role="status" className={c.limit}>
          {limit === 'day' ? t('limitDay') : t('limitMonth')}
        </div>
      )}
      <AskBox
        inputRef={inputRef}
        draft={session.draft}
        onDraft={(text) => setDraft(me, text)}
        onSend={() => submit(session.draft)}
        onStop={stop}
        running={running}
        disabled={offline || !!limit}
        offline={offline}
        depth={session.depth}
        thoroughOk={thoroughOk}
        onDepth={(d) => setDepth(me, d)}
      />
    </aside>
  );
}
