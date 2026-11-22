import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initI18n } from './app/i18n';
import { applyTheme } from './app/prefs';
import { platform } from './platform';
import './ui/tokens.css';

const path = location.pathname;
const Dev = !import.meta.env.DEV
  ? null
  : path === '/dev/gallery'
    ? lazy(() => import('./dev/Gallery'))
    : path === '/dev/timeline'
      ? lazy(() => import('./dev/TimelineHarness'))
      : path === '/dev/app' || path.startsWith('/dev/app/')
        ? lazy(() => import('./dev/FakeApp'))
        : null;

initI18n();
applyTheme();
if (platform.desktop) document.documentElement.dataset.desktop = '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {Dev ? (
      <Suspense>
        <Dev />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
