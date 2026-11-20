import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initI18n } from './app/i18n';
import './ui/tokens.css';

const Gallery =
  import.meta.env.DEV && location.pathname === '/dev/gallery' ? lazy(() => import('./dev/Gallery')) : null;

initI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {Gallery ? (
      <Suspense>
        <Gallery />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
