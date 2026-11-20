import { useTranslation } from 'react-i18next';
import { useWorkspace, type Dm } from '../../matrix';
import { others } from './Face';

/** "Erik Kvam, Lea Aune" / "Erik Kvam、Lea Aune". */
export function useDmName(): (dm: Dm) => string {
  const { t } = useTranslation();
  const meId = useWorkspace((x) => x.me.id);
  return (dm) =>
    others(dm, meId)
      .map((p) => p.name)
      .join(t('people.nameSeparator'));
}

/** Team people see the amber corner on client people; clients don't see it on the team. */
export function useShowExternal(): boolean {
  return useWorkspace((x) => !x.me.external);
}
