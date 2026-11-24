import { useEffect, type ReactNode } from 'react';
import i18n from 'i18next';
import { matchPath, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useStore, useWorkspace } from '../../matrix';
import { channelPath, homeChannel } from '../places';
import { currentLanguage, setLanguage } from '../i18n';
import { lazyComponent } from '../lazy';
import { onThemePrefChange } from '../prefs';

// The dialog's code loads when Settings first opens (M8).
const Settings = lazyComponent(() => import('./Settings').then((m) => m.Settings));

export const settingsTabs = ['profile', 'notifications', 'appearance', 'devices'] as const;
export type SettingsTab = (typeof settingsTabs)[number];

type Background = { background?: string };

/** Where Settings opens from: keeps the page you were on behind the dialog. */
export function settingsState(location: { pathname: string; search: string }): Background {
  return { background: location.pathname + location.search };
}

/**
 * /settings/:tab? opens over the workspace (ProfileMenuSettings). The workspace keeps rendering the page you came from
 * (or your home channel when the link was opened directly).
 */
export function WithSettings({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const param = matchPath('/settings/:tab?', location.pathname)?.params;
  // Unknown tabs fall through to the workspace's "not available".
  const match = param && (param.tab === undefined || settingsTabs.includes(param.tab as SettingsTab)) ? param : undefined;
  const from = (location.state as Background | null)?.background;
  const home = useWorkspace((x) => {
    const c = homeChannel(x);
    return c ? channelPath(c.spaceId, c.id) : '/';
  });
  const tab = (match?.tab as SettingsTab | undefined) ?? 'profile';
  const background = match ? (from ?? home) : undefined;

  return (
    <>
      <Routes location={background ?? location}>
        <Route path="*" element={children} />
      </Routes>
      {match && (
        <Settings
          tab={tab}
          onTab={(next: SettingsTab) => navigate(next === 'profile' ? '/settings' : `/settings/${next}`, { replace: true, state: location.state })}
          onClose={() => (from ? navigate(-1) : navigate(home, { replace: true }))}
        />
      )}
    </>
  );
}

/** Language and theme follow you to other devices: every change is written to the account (D-09). */
export function SettingsSync() {
  const store = useStore();
  useEffect(() => {
    let live = true;
    let account: string | undefined;
    const onLanguage = (lng: string) => {
      if (lng === account) return;
      account = lng;
      void store.setSetting('language', lng).catch(() => {
        if (account === lng) account = undefined;
      });
    };
    i18n.on('languageChanged', onLanguage);
    // The account's language wins at sign-in; an account without one (made before this) is stamped with the current one.
    store.settings().then(
      ({ language }) => {
        if (!live || account !== undefined) return;
        if (language === 'en' || language === 'ja') {
          account = language;
          if (language !== currentLanguage()) void setLanguage(language);
        } else onLanguage(currentLanguage());
      },
      () => {},
    );
    const offTheme = onThemePrefChange((pref) => void store.setSetting('theme', pref).catch(() => {}));
    return () => {
      live = false;
      i18n.off('languageChanged', onLanguage);
      offTheme();
    };
  }, [store]);
  return null;
}
