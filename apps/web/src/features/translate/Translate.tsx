import { useEffect, useMemo, type ReactNode } from 'react';
import { useStore, useWorkspace, type Message, type WorkspaceSnapshot } from '../../matrix';
import { contentKey, fits, looksForeign, readableText } from '../../app/translate';
import type { BodyOverride } from '../../app/registry';
import { sourceOf, toggle, translate, useEntry } from './state';
import { useT } from './strings';
import c from './Translate.module.css';

export function LanguagesIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

const textKinds = new Set(['text', 'emote', 'notice']);
const team = (role: string | undefined) => role === 'owner' || role === 'admin' || role === 'member';

/**
 * Team only, and never where clients or guests are: only channels of the workspace I'm on the team of (an unjoined
 * client space can look like a workspace), only once their member list is known, and DMs without outside people.
 */
export function teamConversation(s: WorkspaceSnapshot, channelId: string): boolean {
  const ws = s.spaces.find((x) => x.kind === 'workspace' && team(s.myRoles[x.id]));
  if (!ws) return false;
  const ch = s.channels[ws.id]?.find((x) => x.id === channelId);
  if (ch) return !ch.outside?.length && !ch.outsidePending;
  const dm = s.dms.find((d) => d.id === channelId);
  return !!dm && !dm.people.some((p) => p.external);
}

/** Whether Translate applies to this message for me, and whether it looks like the other language. */
function useEligible(m: Message) {
  const { target } = useT();
  const meId = useWorkspace((s) => s.me.id);
  const allowed = useWorkspace((s) => teamConversation(s, m.channelId));
  const ok = allowed && m.sender.id !== meId && !m.sender.external && m.status === 'sent' && textKinds.has(m.kind ?? 'text');
  const { size, foreign } = useMemo(
    () => (ok ? { size: fits(sourceOf(m)), foreign: looksForeign(readableText(m.body, m.html), target) } : { size: false, foreign: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the text, sender and id matter
    [ok, m.id, m.sender.id, m.body, m.html, target],
  );
  return { eligible: ok && size, foreign, target };
}

export function useTranslateButton(m: Message) {
  const { t } = useT();
  const store = useStore();
  const entry = useEntry(m.id);
  const { eligible, foreign, target } = useEligible(m);
  if (!eligible || (entry.status === 'none' && !foreign)) return null;
  return {
    icon: <LanguagesIcon />,
    label: t('translate'),
    pressed: entry.status === 'translated',
    run: () => toggle(store, m, target),
  };
}

export function TranslateBody({ message: m, render }: { message: Message; render: (override?: BodyOverride) => ReactNode }) {
  const { t } = useT();
  const store = useStore();
  const entry = useEntry(m.id);
  const { eligible, target } = useEligible(m);
  const stale = eligible && entry.status === 'translated' && entry.key !== contentKey(sourceOf(m), target);
  useEffect(() => {
    if (stale) translate(store, m, target);
  }, [stale, store, m, target]);

  if (!eligible || entry.status === 'none') return render();
  const text = entry.status === 'translated' && entry.result ? render({ ...entry.result, lang: target }) : render();
  return (
    <>
      {entry.status === 'translating' ? (
        <div className={c.wait} aria-busy="true">
          {text}
        </div>
      ) : (
        text
      )}
      <div className={c.line} role={entry.status === 'failed' ? 'alert' : entry.status === 'translating' ? 'status' : undefined}>
        <LanguagesIcon size={14} className={entry.status === 'failed' ? c.glyphFail : c.glyph} />
        {entry.status === 'translating' && (
          <>
            <span className={c.dots} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className={c.sr}>{t('translating')}</span>
          </>
        )}
        {(entry.status === 'translated' || entry.status === 'original') && (
          <button type="button" className={c.link} onClick={() => toggle(store, m, target)}>
            {entry.status === 'translated' ? t('showOriginal') : t('showTranslation')}
          </button>
        )}
        {entry.status === 'failed' && (
          <>
            <span className={c.fail}>{t('failed')}</span>
            <span aria-hidden="true" className={c.dot} />
            <button type="button" className={c.link} onClick={() => translate(store, m, target)}>
              {t('retry')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
