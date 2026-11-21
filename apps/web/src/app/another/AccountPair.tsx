import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, CopyIcon } from './icons';
import s from './Another.module.css';

export const copiedMs = 1200;

/**
 * Copies, then names what was copied for 1.2 s (the icon turns into a check; RulesM5).
 * `count` goes up with every copy so each one is announced, even a second one within 1.2 s.
 */
export function useCopied<K extends string>(): [K | undefined, (key: K, text: string) => void, number] {
  const [copied, setCopied] = useState<{ key: K; count: number }>();
  const count = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (key: K, text: string) =>
    void (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'))).then(
      () => {
        setCopied({ key, count: ++count.current });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(undefined), copiedMs);
      },
      () => {},
    );
  return [copied?.key, copy, copied?.count ?? 0];
}

/** Screen readers hear "Copied"; the region exists before it speaks, and a fresh node per copy is a fresh announcement. */
export function CopiedLive({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span aria-live="polite" className={s.live}>
      {count > 0 && <span key={count}>{t('another.copied')}</span>}
    </span>
  );
}

/** Server + username for Element X and other apps: the only place a server name appears (D-15). */
export function AccountPair({ server, username, look }: { server: string; username: string; look: 'sheet' | 'card' }) {
  const { t } = useTranslation();
  const [copied, copy, count] = useCopied<'server' | 'username'>();
  const row = (key: 'server' | 'username', label: string, value: string, copyLabel: string) => (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <button type="button" className={s.copy} aria-label={copyLabel} onClick={() => copy(key, value)}>
        {copied === key ? (
          <span key="done" className={s.check}>
            <CheckIcon />
          </span>
        ) : (
          <CopyIcon size={look === 'sheet' ? 16 : 15} />
        )}
      </button>
    </>
  );
  return (
    <>
      <dl className={[s.pair, s[look]].join(' ')}>
        {row('server', t('another.server'), server, t('another.copyServer'))}
        {row('username', t('another.username'), username, t('another.copyUsername'))}
      </dl>
      <CopiedLive count={count} />
    </>
  );
}
