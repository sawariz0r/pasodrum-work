// Translation for other features' text (D-37): Docs sections, Boards titles, descriptions and cards. Same gate as
// messages (D-32): team only, and only in the workspace, never in a client space.
import { useMemo } from 'react';
import { useStore, useWorkspace } from '../../matrix';
import { fits, looksForeign, readableText, translateText } from '../../app/translate';
import type { TextTranslation } from '../../app/registry';
import { LanguagesIcon } from './Translate';
import { useT } from './strings';

const TEAM = new Set<string>(['owner', 'admin', 'staff']);

export const textTranslation: TextTranslation = {
  useTranslator(spaceId) {
    const { target, t } = useT();
    const store = useStore();
    const allowed = useWorkspace((s) => s.spaces.some((x) => x.id === spaceId && x.kind === 'workspace' && TEAM.has(s.myRoles[x.id] ?? '')));
    return useMemo(
      () =>
        allowed
          ? {
              target,
              offers: (text: string, html?: string) => looksForeign(readableText(text, html), target) && fits({ body: text, ...(html ? { html } : {}) }),
              translate: (source: { id: string; body: string; html?: string }) => translateText(store, source, target),
              icon: <LanguagesIcon />,
              labels: { translate: t('translate'), showOriginal: t('showOriginal'), failed: t('failed'), retry: t('retry') },
            }
          : null,
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is new every render; the labels follow the language (target)
      [allowed, target, store],
    );
  },
};
