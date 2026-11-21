import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useWorkspace, WorkspaceProvider, type InvitePreview, type Session, type WorkspaceStore } from '../matrix';
import { hostOf, usePhone } from './another/elementX';
import { PhoneHandoffSignedIn, PhoneHandoffSignedOut } from './another/PhoneHandoff';
import { matrixBackend, type Backend } from './backend';
import { FirstRun, startFirstRun } from './join/FirstRun';
import { JoinRoute, JoinRouteSignedIn } from './join/JoinRoute';
import { lastIdentifier, rememberIdentifier } from './prefs';
import { SettingsSync, WithSettings } from './settings/SettingsRoute';
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
  // Phones get the hand-off on every app route; /join/* works on phones (D-15, D-28).
  const phone = usePhone();

  const onSignedIn = (session: Session, identifier: string) => {
    rememberIdentifier(identifier);
    setExpired(undefined);
    setSignedOut(false);
    setSigned({ session, store: backend.createWorkspaceStore(session) });
  };
  const from = (location.state as { from?: string } | null)?.from;

  const end = (next?: Expired, to = '/signin') => {
    if (!signed) return;
    void signed.store.signOut().catch(() => {});
    setExpired(next);
    setSignedOut(!next);
    setSigned(null);
    navigate(to, { replace: true });
  };

  // Join page → "Open in browser": the claimed account signs in and lands in the channel it was added to.
  const onJoined = (session: Session, identifier: string, preview: InvitePreview) => {
    startFirstRun(session.userId, preview.spaceName);
    onSignedIn(session, identifier);
    navigate('/', { replace: true });
  };

  return (
    <Routes>
      <Route
        path="/signin"
        element={
          signed ? (
            <Navigate to={from && from !== '/signin' ? from : '/'} replace />
          ) : phone ? (
            <PhoneHandoffSignedOut server={hostOf(backend.defaultServer())} from={from} />
          ) : (
            <SignIn key={expired ? 'expired' : 'new'} backend={backend} expired={expired} onSignedIn={onSignedIn} />
          )
        }
      />
      <Route
        path="/join/:code"
        element={
          signed ? (
            <WorkspaceProvider store={signed.store}>
              <JoinRouteSignedIn backend={backend} onJoined={onJoined} onSignOut={() => end(undefined, location.pathname)} />
            </WorkspaceProvider>
          ) : (
            <JoinRoute backend={backend} onJoined={onJoined} />
          )
        }
      />
      <Route
        path="*"
        element={
          signed ? (
            <WorkspaceProvider store={signed.store}>
              <OnExpired onExpired={() => end({ identifier: lastIdentifier(), baseUrl: signed.session.baseUrl })} />
              <SettingsSync />
              {phone ? (
                <PhoneHandoffSignedIn />
              ) : (
                <>
                  <FirstRun />
                  <WithSettings>
                    <Workspace onSignOut={() => end()} />
                  </WithSettings>
                </>
              )}
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
