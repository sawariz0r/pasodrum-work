import { useNavigate } from 'react-router';
import { useToast } from '../../app/toast';
import { useStore } from '../../matrix';
import { useT } from './strings';

export const pagePath = (id: string) => `/docs/${encodeURIComponent(id)}`;

/** Makes a page and opens it with the title ready for typing. */
export function useCreatePage() {
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  return (o: { spaceId: string; parent?: string }) =>
    store.docsBoards.createPage(o).then(
      (id) => navigate(pagePath(id), { state: { focusTitle: true } }),
      () => toast(t('createFailed')),
    );
}
