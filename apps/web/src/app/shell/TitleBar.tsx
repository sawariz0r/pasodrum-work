import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useWorkspaceName } from '../channels/shared';
import { useFind } from '../find/Switcher';
import { ChevronLeftIcon, ChevronNextIcon, SearchIcon } from '../icons';
import s from './TitleBar.module.css';

type History = { canGoBack: boolean; canGoForward: boolean };

/** Desktop app only (DesktopWindow): ← → and the search field over the 40px strip drawn in tokens.css. */
export function TitleBarControls() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useLocation(); // re-reads canGoBack/canGoForward after every navigation
  const find = useFind();
  const workspace = useWorkspaceName();
  const history = (window as unknown as { navigation?: History }).navigation;

  return (
    <div className={s.bar}>
      <span className={s.arrows}>
        <button type="button" className={s.arrow} aria-label={t('desktop.back')} disabled={history?.canGoBack === false} onClick={() => navigate(-1)}>
          <ChevronLeftIcon size={16} />
        </button>
        <button type="button" className={s.arrow} aria-label={t('desktop.forward')} disabled={history?.canGoForward === false} onClick={() => navigate(1)}>
          <ChevronNextIcon size={16} />
        </button>
      </span>
      <span className={s.middle}>
        <button type="button" className={s.search} aria-haspopup="dialog" aria-expanded={find.isOpen} onClick={find.open}>
          <SearchIcon size={14} strokeWidth={2.2} />
          <span className={s.label}>{t('find.placeholder', { workspace })}</span>
        </button>
      </span>
    </div>
  );
}
