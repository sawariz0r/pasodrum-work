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

/**
 * Team people (Owner/Admin/Member somewhere) see the amber corner and the outside mark; clients and guests never do,
 * since they are the outside people (RulesM5). Decided by my roles: the server never marks me as external.
 */
export function useShowExternal(): boolean {
  return useWorkspace((x) => Object.values(x.myRoles).some((r) => r === 'owner' || r === 'admin' || r === 'member'));
}
