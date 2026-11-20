// Mention picker (MentionPicker board) and the :shortcode: list, which reuses its look.
import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import type { Person } from '../../matrix';
import { avatarColor, initialsOf, isCjk } from '../../ui';
import type { Emoji } from './emoji';
import type { SuggestState, SuggestStore } from './suggest';
import s from './Composer.module.css';

export function useSuggest<T>(store: SuggestStore<T>): SuggestState<T> | null {
  return useSyncExternalStore(store.subscribe, store.get);
}

function Hit({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <span className={s.optRest}>{text}</span>;
  return (
    <>
      {i > 0 && <span className={s.optRest}>{text.slice(0, i)}</span>}
      <span className={s.optHit}>{text.slice(i, i + query.length)}</span>
      <span className={s.optRest}>{text.slice(i + query.length)}</span>
    </>
  );
}

type ListProps<T> = {
  store: SuggestStore<T>;
  state: SuggestState<T>;
  label: string;
  style?: CSSProperties;
  /** Positions the list after render (it depends on layout, e.g. the caret). */
  place?: (el: HTMLElement) => void;
};

function List<T>({ store, state, label, style, place, row, name }: ListProps<T> & { row: (item: T) => React.ReactNode; name: (item: T) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && place) place(ref.current);
  });
  return (
    <div ref={ref} className={`${s.popover} ${s.suggest}`} role="listbox" aria-label={label} style={style} onMouseDown={(e) => e.preventDefault()}>
      {state.items.map((item, i) => (
        <div
          key={i}
          role="option"
          aria-selected={i === state.index}
          aria-label={name(item)}
          className={s.option}
          onMouseEnter={() => store.hover(i)}
          onClick={() => store.pick(i)}
        >
          {row(item)}
        </div>
      ))}
    </div>
  );
}

export function MentionList(props: ListProps<Person>) {
  const { state } = props;
  return (
    <List
      {...props}
      name={(p) => p.name}
      row={(p) => {
        const initials = initialsOf(p.name);
        return (
          <>
            <span className={`${s.optAvatar} ${isCjk(initials) ? s.cjk : ''}`} style={{ background: avatarColor(p.id) }} aria-hidden="true">
              {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials}
            </span>
            <span className={s.optText}>
              <Hit text={p.name} query={state.query} />
            </span>
          </>
        );
      }}
    />
  );
}

export function EmojiList(props: ListProps<Emoji>) {
  return (
    <List
      {...props}
      name={(e) => (e.code ? `:${e.code}:` : e.names[0]!)}
      row={(e) => (
        <>
          <span className={s.optEmoji} aria-hidden="true">
            {e.unicode}
          </span>
          <span className={s.optText}>
            <span className={s.optRest}>{e.code ? `:${e.code}:` : e.names[0]}</span>
          </span>
        </>
      )}
    />
  );
}
