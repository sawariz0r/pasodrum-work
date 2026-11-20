import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Person, Reaction } from '../../matrix';
import { formatList } from '../format';
import { SmileIcon } from '../icons';
import { ReactionPicker } from './ReactionPicker';
import s from './Rich.module.css';

const tipDelayMs = 500;

/** Up to 3 names, you last, then "and N others". */
export function useReactedBy() {
  const { t, i18n } = useTranslation();
  const sep = i18n.language === 'ja' ? '、' : ', ';
  return (r: Reaction, meId: string) => {
    const others = r.senders.filter((p: Person) => p.id !== meId).map((p) => p.name);
    const names = [...others.slice(0, r.mine ? 2 : 3), ...(r.mine ? [t('timeline.you')] : [])];
    const extra = r.count - names.length;
    return extra > 0 ? t('timeline.reactedOthers', { names: names.join(sep), count: extra }) : formatList(names);
  };
}

function Chip({ r, meId, fresh, onToggle }: { r: Reaction; meId: string; fresh: boolean; onToggle: (key: string, mine: boolean) => void }) {
  const { t } = useTranslation();
  const reactedBy = useReactedBy();
  const [tip, setTip] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip(true), tipDelayMs);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setTip(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span className={s.chipWrap} onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        className={[s.chip, fresh && s.chipNew].filter(Boolean).join(' ')}
        aria-pressed={r.mine}
        aria-label={t(r.mine ? 'timeline.reactionMine' : 'timeline.reaction', { emoji: r.key, count: r.count })}
        onClick={() => onToggle(r.key, r.mine)}
        onFocus={show}
        onBlur={hide}
      >
        <span className={s.emoji}>{r.key}</span>
        {r.count}
      </button>
      {tip && r.senders.length > 0 && (
        <span className={s.reactTip} role="tooltip">
          <span className={s.reactTipEmoji}>{r.key}</span>
          <span>{reactedBy(r, meId)}</span>
        </span>
      )}
    </span>
  );
}

export function Reactions({
  reactions,
  meId,
  onToggle,
  onPick,
}: {
  reactions: Reaction[];
  meId: string;
  onToggle: (key: string, mine: boolean) => void;
  onPick: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [initial] = useState(() => new Set(reactions.map((r) => r.key)));
  return (
    <div className={s.reactions}>
      {reactions.map((r) => (
        <Chip key={r.key} r={r} meId={meId} fresh={!initial.has(r.key)} onToggle={onToggle} />
      ))}
      <ReactionPicker onPick={onPick} align="start">
        <button type="button" className={s.addReaction} aria-label={t('timeline.addReaction')}>
          <SmileIcon size={15} />
        </button>
      </ReactionPicker>
    </div>
  );
}
