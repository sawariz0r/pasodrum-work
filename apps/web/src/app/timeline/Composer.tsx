import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isImeEnter } from '../../ui';
import s from './Composer.module.css';

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
    </svg>
  );
}

export function Composer({ channelName, onSend }: { channelName: string; onSend: (body: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const hasText = draft.trim().length > 0;

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const send = () => {
    const body = draft.trim();
    field.current?.focus();
    if (!body) return;
    onSend(body);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.shiftKey || !isImeEnter(e)) return;
    e.preventDefault();
    send();
  };

  return (
    <div className={s.dock}>
      <div className={s.box}>
        <textarea
          ref={field}
          className={s.field}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t('composer.label', { channel: t('common.channelName', { name: channelName }) })}
          placeholder={t('composer.placeholder', { channel: channelName })}
          autoComplete="off"
          autoFocus
        />
        <div className={s.actions}>
          <button
            type="button"
            className={s.send}
            onClick={send}
            disabled={!hasText}
            aria-label={t('composer.send')}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
