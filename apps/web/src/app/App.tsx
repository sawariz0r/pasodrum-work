import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useWorkspace, WorkspaceProvider, type Session, type WorkspaceStore } from '../matrix';
import { matrixBackend, type Backend } from './backend';
import { lastIdentifier, rememberIdentifier } from './prefs';
import { Workspace } from './shell/Shell';
import { SignIn, type Expired } from './signin/SignIn';

export function App({ backend = matrixBackend, basename }: { backend?: Backend; basename?: string }) {
  return (
    <BrowserRouter basename={basename}>
      <AppRoutes backend={backend} />
    </BrowserRouter>
  );
}

type Signed = { session: Session; store: WorkspaceStore };

// Outside render state: StrictMode runs state initializers twice, and a store starts syncing when created.
const restored = new WeakMap<Backend, Signed | null>();

function restore(backend: Backend): Signed | null {
  if (!restored.has(backend)) {
    const session = backend.loadSession();
    restored.set(backend, session ? { session, store: backend.createWorkspaceStore(session) } : null);
  }
  return restored.get(backend) ?? null;
}

export function AppRoutes({ backend }: { backend: Backend }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [signed, setSigned] = useState(() => restore(backend));
  const [expired, setExpired] = useState<Expired>();
  // After a deliberate sign-out, the next person shouldn't land on the previous person's page.
  const [signedOut, setSignedOut] = useState(false);

  const onSignedIn = (session: Session, identifier: string) => {
    rememberIdentifier(identifier);
    setExpired(undefined);
    setSignedOut(false);
    setSigned({ session, store: backend.createWorkspaceStore(session) });
  };
  const from = (location.state as { from?: string } | null)?.from;

  const end = (next?: Expired) => {
    if (!signed) return;
    void signed.store.signOut().catch(() => {});
    setExpired(next);
    setSignedOut(!next);
    setSigned(null);
    navigate('/signin', { replace: true });
  };

  return (
    <Routes>
      <Route
        path="/signin"
        element={signed ? <Navigate to={from && from !== '/signin' ? from : '/'} replace /> : <SignIn key={expired ? 'expired' : 'new'} backend={backend} expired={expired} onSignedIn={onSignedIn} />}
      />
      <Route
        path="*"
        element={
          signed ? (
            <WorkspaceProvider store={signed.store}>
              <OnExpired onExpired={() => end({ identifier: lastIdentifier(), baseUrl: signed.session.baseUrl })} />
              <Workspace onSignOut={() => end()} />
            </WorkspaceProvider>
          ) : (
            <Navigate to="/signin" replace state={signedOut ? undefined : { from: location.pathname + location.search }} />
          )
        }
      />
    </Routes>
  );
}

function OnExpired({ onExpired }: { onExpired: () => void }) {
  const expired = useWorkspace((x) => x.sessionExpired);
  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);
  return null;
}
