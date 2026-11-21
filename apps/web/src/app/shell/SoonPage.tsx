import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import s from './Shell.module.css';

/** A rail page that only says Soon (DocsSoon, BoardsSoon): one word, no controls (D-19, D-33). For features' routes. */
export function SoonPage({ icon, title }: { icon: ReactNode; title: string }) {
  const { t } = useTranslation();
  return (
    <div className={s.soon}>
      <div className={s.soonIcon}>{icon}</div>
      <h1 className={s.soonTitle}>
        {title}
        <span className={s.soonPill}>{t('shell.soon')}</span>
      </h1>
    </div>
  );
}
