(async () => {
  await P.waitFor(() => location.pathname !== '/signin', 20000);
  const s = window.pasodrumShell;
  s.onOpenRoute((r) => {
    P.emit('route', { r });
    history.pushState(null, '', r);
    dispatchEvent(new PopStateEvent('popstate'));
  });
  if (P.ran) return;
  P.ran = true;
  await P.sleep(2000);
  s.setBadge(7);
  P.emit('badge', { n: 7 });
  await P.sleep(8000);
  s.setBadge(0);
  P.emit('badge', { n: 0 });
  try {
    await window.__TAURI__.core.invoke('plugin:notification|notify', { options: { title: 'Plugin path', body: 'via plugin:notification|notify' } });
    P.emit('plugin-notify', { ok: true, perm: await window.__TAURI__.core.invoke('plugin:notification|is_permission_granted').catch((e) => String(e)) });
  } catch (e) {
    P.emit('plugin-notify', { error: String(e) });
  }
  await P.sleep(3000);
  s.notify({ title: 'Ana', body: 'hi (click me)', route: '/settings' });
  P.emit('bridge-notify', {});
})();
