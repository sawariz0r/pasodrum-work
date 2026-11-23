// The ask box: one line, the depth picker (a menu of two radio items), Send, and Stop while an answer is running.
import * as DM from '@radix-ui/react-dropdown-menu';
import type { RefObject } from 'react';
import type { Depth } from '../../matrix';
import { isImeEnter, Menu, MenuContent, MenuTrigger } from '../../ui';
import { CheckIcon, ChevronDownIcon, SendIcon, StopIcon } from './icons';
import { useT } from './strings';
import c from './Panel.module.css';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  draft: string;
  onDraft: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  /** Offline, or a limit reached. */
  disabled: boolean;
  offline: boolean;
  depth: Depth;
  thoroughOk: boolean;
  onDepth: (depth: Depth) => void;
};

export function AskBox({ inputRef, draft, onDraft, onSend, onStop, running, disabled, offline, depth, thoroughOk, onDepth }: Props) {
  const { t } = useT();
  const shown: Depth = depth === 'thorough' && thoroughOk ? 'thorough' : 'quick';
  const canSend = !disabled && !running && draft.trim().length > 0;
  return (
    <div className={c.boxWrap}>
      <div className={[c.box, disabled && c.boxOff].filter(Boolean).join(' ')}>
        <label htmlFor="assistant-ask" className={c.sr}>
          {t('assistant')}
        </label>
        <input
          id="assistant-ask"
          ref={inputRef}
          className={c.input}
          type="text"
          autoComplete="off"
          placeholder={offline ? t('offline') : t('ask')}
          value={draft}
          disabled={disabled}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (!isImeEnter(e)) return;
            e.preventDefault();
            if (canSend) onSend();
          }}
        />
        <Menu modal={false}>
          <MenuTrigger asChild>
            <button type="button" className={c.depth} aria-label={t('depth')}>
              {shown === 'thorough' ? t('thorough') : t('quick')}
              <ChevronDownIcon />
            </button>
          </MenuTrigger>
          <MenuContent side="top" align="end" sideOffset={14} width={296} className={c.menu}>
            <DM.RadioGroup value={shown} onValueChange={(v) => onDepth(v as Depth)}>
              <DM.RadioItem value="quick" className={c.menuItem}>
                <span className={c.check}>
                  <DM.ItemIndicator>
                    <CheckIcon />
                  </DM.ItemIndicator>
                </span>
                <span className={c.menuLabel}>{t('quick')}</span>
                <span className={c.menuHint}>{t('hintQuick')}</span>
              </DM.RadioItem>
              <DM.RadioItem value="thorough" className={c.menuItem} disabled={!thoroughOk}>
                <span className={c.check}>
                  <DM.ItemIndicator>
                    <CheckIcon />
                  </DM.ItemIndicator>
                </span>
                <span className={c.menuLabel}>{t('thorough')}</span>
                <span className={c.menuHint}>{thoroughOk ? t('hintThorough') : t('hintNone')}</span>
              </DM.RadioItem>
            </DM.RadioGroup>
          </MenuContent>
        </Menu>
        {running ? (
          <button type="button" className={c.stop} aria-label={t('stop')} onClick={onStop}>
            <StopIcon />
          </button>
        ) : (
          <button type="button" className={c.send} aria-label={t('send')} disabled={!canSend} onClick={onSend}>
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}
