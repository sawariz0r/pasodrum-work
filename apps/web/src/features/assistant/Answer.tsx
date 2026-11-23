// One turn: the ask, then the answer as the boards draw it. Every string the model wrote is a plain text node (spec §4.3).
import { useState, type ReactNode } from 'react';
import type { Answer as AnswerData, AssistantStatusLine, SearchHit } from '../../matrix';
import { Face } from '../../app/people/Face';
import { useListTime } from '../../app/pages/lists';
import { ChevronDownIcon, ChevronUpIcon, CloserIcon, HashIcon, MessageIcon, SearchIcon, SparkIcon } from './icons';
import { usePlaces, type Place } from './places';
import type { Turn } from './session';
import { gap, joinList, useT } from './strings';
import c from './Panel.module.css';

type Props = {
  turn: Turn;
  /** Look closer is offered under this answer. */
  closer: boolean;
  onCloser: () => void;
  onRetry: () => void;
};

export function TurnView({ turn, closer, onCloser, onRetry }: Props) {
  const { t } = useT();
  return (
    <>
      <div className={c.askRow}>
        <div className={c.ask}>{turn.ask}</div>
      </div>
      {turn.state === 'working' && <Working status={turn.status} closer={!!turn.closer} />}
      {turn.state === 'answered' && turn.answer && <Answer answer={turn.answer} rows={turn.rows ?? []} closer={closer} onCloser={onCloser} />}
      {turn.state === 'stopped' && (
        <Group>
          <p className={c.quiet}>{t('stopped')}</p>
        </Group>
      )}
      {turn.state === 'failed' && (
        <Group>
          <p className={c.say}>{t('failed')}</p>
          <div>
            <button type="button" className={c.retry} onClick={onRetry}>
              {t('retry')}
            </button>
          </div>
        </Group>
      )}
    </>
  );
}

function Group({ children, working = false }: { children: ReactNode; working?: boolean }) {
  const { t } = useT();
  return (
    <div className={c.answer} role="group" aria-label={t('byAssistant')}>
      <span className={c.spark} aria-hidden="true">
        <SparkIcon size={15} className={working ? c.pulse : undefined} />
      </span>
      <div className={c.blocks}>{children}</div>
    </div>
  );
}

function Working({ status, closer }: { status?: AssistantStatusLine; closer: boolean }) {
  const { t, lang } = useT();
  const { describe } = usePlaces();
  const names = [...new Set((status?.places ?? []).flatMap((r) => describe(r)?.label ?? []))];
  const line = closer ? t('lookingCloser') : names.length ? t('lookingIn', { list: gap(lang, joinList(t, lang, names)) }) : '';
  return (
    <Group working>
      <p role="status" className={c.status}>
        {line || <span className={c.sr}>{t('working')}</span>}
      </p>
      <div className={c.skeleton} aria-hidden="true">
        <span style={{ width: '92%' }} />
        <span style={{ width: '78%' }} />
        <span style={{ width: '54%' }} />
      </div>
    </Group>
  );
}

function Answer({ answer, rows, closer, onCloser }: { answer: AnswerData; rows: SearchHit[]; closer: boolean; onCloser: () => void }) {
  const { t } = useT();
  const { describe } = usePlaces();
  const opens = answer.parts.flatMap((p) => (p.t === 'open' ? [{ place: describe(p.target, p.plain), plain: p.plain }] : []));
  // Parts no registered component draws show the line the server wrote.
  const plain = answer.parts.flatMap((p) => ((p.t === 'source' && p.target.k !== 'message') || p.t === 'heading' || p.t === 'proposal' ? [p.plain] : []));
  return (
    <Group>
      <Looked answer={answer} />
      {answer.say && <p className={c.say}>{answer.say}</p>}
      {rows.length > 0 && <MessageRows rows={rows} />}
      {plain.map((line, i) => (
        <p key={i} className={c.plain}>
          {line}
        </p>
      ))}
      {opens.map(({ place, plain: name }, i) => (
        <div key={i}>
          <button type="button" className={c.openButton} onClick={place?.open} disabled={!place?.open}>
            {place?.icon === 'hash' && <HashIcon size={15} />}
            {t('openPlace', { name: place?.label ?? name })}
          </button>
        </div>
      ))}
      {closer && (
        <div>
          <button type="button" className={c.closer} onClick={onCloser}>
            <CloserIcon />
            {t('lookCloser')}
          </button>
        </div>
      )}
    </Group>
  );
}

/** "Looked in #portal and your conversation with 森 真由": the app writes it from `looked`; it opens to the list. */
function Looked({ answer }: { answer: AnswerData }) {
  const { t, lang } = useT();
  const { describe } = usePlaces();
  const [open, setOpen] = useState(false);
  const seen = new Set<string>();
  const places: { place: Place; count?: number }[] = [];
  for (const l of answer.looked) {
    const place = describe(l.target, l.plain);
    if (!place || seen.has(place.label)) continue;
    seen.add(place.label);
    places.push({ place, count: l.count });
  }
  if (!places.length) return null;
  const list = gap(lang, joinList(t, lang, places.map((p) => p.place.label)));
  return (
    <div>
      <button type="button" className={c.looked} aria-expanded={open} onClick={() => setOpen(!open)}>
        <SearchIcon className={c.lookedIcon} />
        <span className={c.lookedText}>{t(answer.depth === 'thorough' ? 'lookedCloserIn' : 'lookedIn', { list })}</span>
        {open ? <ChevronUpIcon size={12} strokeWidth={2.4} className={c.chevron} /> : <ChevronDownIcon size={12} strokeWidth={2.4} className={c.chevron} />}
      </button>
      {open && (
        <div className={c.rows}>
          {places.map(({ place, count }) => {
            const inner = (
              <>
                <span className={c.placeIcon}>{place.icon === 'hash' ? <HashIcon size={15} strokeWidth={2} /> : place.icon === 'chat' ? <MessageIcon size={15} /> : null}</span>
                <span className={c.placeName}>{place.name}</span>
                {count !== undefined && <span className={c.placeNote}>{t('messages', { count })}</span>}
              </>
            );
            return place.open ? (
              <button key={place.label} type="button" className={c.placeRow} onClick={place.open}>
                {inner}
              </button>
            ) : (
              <div key={place.label} className={c.placeRow}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessageRows({ rows }: { rows: SearchHit[] }) {
  const { t } = useT();
  const time = useListTime();
  const { openHit } = usePlaces();
  return (
    <div className={c.rows}>
      {rows.map((hit) => (
        <button key={hit.message.id} type="button" className={c.msgRow} aria-label={t('openMessage', { name: hit.message.sender.name })} onClick={() => openHit(hit)}>
          <Face person={hit.message.sender} size={26} className={c.face} />
          <span className={c.msgMain}>
            <span className={c.msgTop}>
              <span className={c.msgName}>{hit.message.sender.name}</span>
              <span className={c.msgTime}>{time(hit.message.ts)}</span>
            </span>
            <span className={c.msgText}>{hit.message.body}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
