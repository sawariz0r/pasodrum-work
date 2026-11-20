import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../ui';
import s from './Shell.module.css';

// Per AppStart, trimmed to the parts M1 shows (D-19): space tiles, channels, one tab.
const channelRows = [58, 104, 86, 54, 78];
const messageRows = [
  [22, 74, 48],
  [16, 58, 0],
  [26, 82, 64],
  [18, 40, 0],
  [24, 70, 36],
  [20, 62, 0],
  [14, 88, 52],
];

export function AppStart() {
  const { t } = useTranslation();
  return (
    <div className={s.shell}>
      <nav aria-hidden="true" className={s.rail}>
        <Skeleton onRail width={40} height={40} radius={11} />
        <Skeleton onRail width={40} height={40} radius={11} />
        <div className={s.railSpacer} />
        <Skeleton onRail width={36} height={36} radius={10} />
      </nav>
      <aside aria-hidden="true" className={s.sidebar}>
        <div className={s.skelHead}>
          <Skeleton width={112} height={16} />
        </div>
        <div className={s.sideList}>
          <div className={s.skelSection}>
            <Skeleton width={64} height={9} />
          </div>
          {channelRows.map((w, i) => (
            <div key={i} className={s.skelRow}>
              <Skeleton width={16} height={16} radius={5} />
              <Skeleton width={w} height={9} />
            </div>
          ))}
        </div>
      </aside>
      <main aria-busy="true" className={s.main}>
        <span className={s.srOnly}>{t('common.loading')}</span>
        <header aria-hidden="true" className={s.header}>
          <Skeleton width={168} height={16} />
        </header>
        <div aria-hidden="true" className={s.skelTabs}>
          <Skeleton width={78} height={10} />
        </div>
        <div aria-hidden="true" className={s.skelTimeline}>
          {messageRows.map(([head, w1, w2], i) => (
            <div key={i} className={s.skelMessage}>
              <Skeleton width={36} height={36} radius={9} />
              <div className={s.skelLines}>
                <Skeleton width={`${head}%`} height={11} />
                <Skeleton width={`${w1}%`} height={9} />
                {w2 ? <Skeleton width={`${w2}%`} height={9} /> : null}
              </div>
            </div>
          ))}
        </div>
        <div aria-hidden="true" className={s.skelComposer}>
          <div />
        </div>
      </main>
    </div>
  );
}
