// D-33 (OpenElsewhere): another tab of this browser holds this device. "Use here" asks it to stop; it never takes over.
import { useTranslation } from 'react-i18next';
import { useStore } from '../../matrix';
import { Button } from '../../ui';
import { TabIcon } from './icons';
import s from './Security.module.css';

export function OpenElsewhere() {
  const { t } = useTranslation();
  const store = useStore();
  return (
    <div role="region" aria-labelledby="open-elsewhere-title" className={s.elsewhere}>
      <div className={s.elsewhereInner}>
        <div className={s.elsewhereTile}>
          <TabIcon />
        </div>
        <h2 id="open-elsewhere-title" className={s.elsewhereTitle}>
          {t('security.elsewhereTitle')}
        </h2>
        <Button className={s.elsewhereUse} onClick={() => store.useHere()}>
          {t('security.useHere')}
        </Button>
      </div>
    </div>
  );
}
