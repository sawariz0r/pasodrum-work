// Link dialog (LinkDialog board): text + address, Save adds or changes the link on the selection.
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { isImeEnter } from '../../ui';
import { LinkIcon, TextIcon } from './icons';
import s from './Composer.module.css';

export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^[^\s:/]+\.[^\s]+$/.test(v)) return `https://${v}`;
  return null;
}

export function LinkDialog({
  text: initialText,
  href: initialHref,
  style,
  onSave,
  onCancel,
}: {
  text: string;
  href: string;
  style?: CSSProperties;
  onSave: (text: string, href: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [href, setHref] = useState(initialHref);
  const url = normalizeUrl(href);
  const removing = !!initialHref && !href.trim();
  const canSave = !!url || removing;

  const save = () => {
    if (canSave) onSave(text.trim() || url || '', url);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isImeEnter(e)) return;
    e.preventDefault();
    save();
  };

  return (
    <div className={`${s.popover} ${s.linkDialog}`} role="dialog" aria-label={t('composer.link')} style={style}>
      <label className={s.linkField}>
        <span role="img" aria-label={t('composer.linkText')} className={s.linkFieldIcon}>
          <TextIcon />
        </span>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} aria-label={t('composer.linkText')} />
      </label>
      <label className={s.linkField}>
        <span role="img" aria-label={t('composer.linkUrl')} className={s.linkFieldIcon}>
          <LinkIcon sw={2} />
        </span>
        <input
          autoFocus
          type="url"
          inputMode="url"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('composer.linkUrlPlaceholder')}
          aria-label={t('composer.linkUrl')}
        />
      </label>
      <div className={s.linkActions}>
        <button type="button" className={s.btn2} onClick={onCancel}>
          {t('composer.cancel')}
        </button>
        <button type="button" className={s.btnPrimary} disabled={!canSave} onClick={save}>
          {t('composer.save')}
        </button>
      </div>
    </div>
  );
}
