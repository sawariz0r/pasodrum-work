import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace } from '../../matrix';
import { platform } from '../../platform';
import { badgeCount, notices, openConversation } from './notify';

/** Mentions and DMs → system notifications (never for the conversation on screen) and the unread badge. */
export function Notifier() {
  const store = useStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const count = useWorkspace(badgeCount);

  useEffect(() => platform.setBadge(count), [count]);
  useEffect(() => () => platform.setBadge(0), []);
  useEffect(() => platform.onOpenRoute((route) => void navigate(route)), [navigate]);

  useEffect(() => {
    const since = Date.now();
    let prev = store.getSnapshot();
    return store.subscribe(() => {
      const next = store.getSnapshot();
      const open = document.hasFocus() ? openConversation(location.pathname) : undefined;
      for (const n of notices(prev, next, { since, open, t })) platform.notify(n);
      prev = next;
    });
  }, [store, t]);

  return null;
}
