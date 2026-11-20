// Emoji picker (EmojiPicker board). Reusable: onPick gets the emoji character.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { isImeEnter } from '../../ui';
import { categories, emojiData, frequent, frequentIcon, loadEmoji, searchEmoji, type EmojiData } from './emoji';
import { SearchIcon } from './icons';
import s from './Composer.module.css';

export function useEmojiData(): EmojiData | null {
  const [data, setData] = useState(emojiData);
  useEffect(() => {
    if (data) return;
    let live = true;
    void loadEmoji().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [data]);
  return data;
}

type Section = { key: 'frequent' | (typeof categories)[number]['key']; icon: string; emoji: string[] };

function Grid({ emoji, onPick }: { emoji: string[]; onPick: (e: string) => void }) {
  return (
    <div className={s.emojiGrid}>
      {emoji.map((e) => (
        <button key={e} type="button" className={s.emo} onClick={() => onPick(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ onPick, style, className }: { onPick: (emoji: string) => void; style?: CSSProperties; className?: string }) {
  const { t } = useTranslation();
  const data = useEmojiData();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>('frequent');
  const scroller = useRef<HTMLDivElement>(null);

  const sections = useMemo<Section[]>(
    () => [
      { key: 'frequent', icon: frequentIcon, emoji: frequent },
      ...categories.map((c) => ({ key: c.key, icon: c.icon, emoji: (data?.byGroup.get(c.group) ?? []).map((e) => e.unicode) })),
    ],
    [data],
  );
  const results = useMemo(() => (data && query.trim() ? searchEmoji(data, query).map((e) => e.unicode) : null), [data, query]);

  const jump = (key: Section['key']) => {
    setQuery('');
    setActive(key);
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-section="${key}"]`);
      if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - scroller.current.offsetTop;
    });
  };

  const onScroll = () => {
    const box = scroller.current;
    if (!box || results) return;
    let current = 'frequent';
    for (const el of box.querySelectorAll<HTMLElement>('[data-section]')) {
      if (el.offsetTop - box.offsetTop <= box.scrollTop + 8) current = el.dataset.section!;
    }
    setActive(current);
  };

  return (
    <div className={`${s.popover} ${s.emojiPicker} ${className ?? ''}`} role="dialog" aria-label={t('composer.emoji')} style={style}>
      <div className={s.emojiSearchWrap}>
        <label className={s.emojiSearch}>
          <SearchIcon />
          <input
            autoFocus
            type="search"
            value={query}
            placeholder={t('composer.emojiSearch')}
            aria-label={t('composer.emojiSearch')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (!isImeEnter(e)) return;
              e.preventDefault();
              if (results?.[0]) onPick(results[0]);
            }}
          />
        </label>
      </div>
      <div role="tablist" aria-label={t('composer.emoji')} className={s.emojiTabs}>
        {sections.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={!results && active === c.key}
            aria-label={t(`composer.emojiGroups.${c.key}`)}
            className={s.emojiTab}
            onClick={() => jump(c.key)}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className={s.emojiScroll} ref={scroller} onScroll={onScroll}>
        {results ? (
          <Grid emoji={results} onPick={onPick} />
        ) : (
          sections.map((c) =>
            c.emoji.length ? (
              <section key={c.key} data-section={c.key} aria-label={t(`composer.emojiGroups.${c.key}`)}>
                <div className={s.emojiHeading}>{t(`composer.emojiGroups.${c.key}`)}</div>
                <Grid emoji={c.emoji} onPick={onPick} />
              </section>
            ) : null,
          )
        )}
      </div>
    </div>
  );
}
