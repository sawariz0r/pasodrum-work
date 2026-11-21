import { DrawerToggle } from '../../app/shell/Drawer';
import { Skeleton } from '../../ui';
import { useT } from './strings';
import s from './Docs.module.css';

export function PageSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t('loading')} className={s.page}>
      <div className={s.header}>
        <DrawerToggle />
        <Skeleton width={70} height={12} />
        <Skeleton width={70} height={12} />
        <Skeleton width={120} height={12} />
      </div>
      <div className={s.skeleton}>
        <Skeleton width="58%" height={34} className={s.skelTitle} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="92%" height={14} />
        <Skeleton width="64%" height={14} />
        <Skeleton width="30%" height={20} className={s.skelHeading} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="74%" height={14} />
        <Skeleton width="100%" height={64} radius={12} className={s.skelBlock} />
      </div>
    </div>
  );
}
