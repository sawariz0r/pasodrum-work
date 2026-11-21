(() => {
  if (window.top !== window || window.pasodrumShell) return;
  const base = new URL(location.href).origin;
  const tauri = () => window.__TAURI__;
  const whenReady = (fn) => {
    const t = tauri();
    if (t) return fn(t);
    setTimeout(() => whenReady(fn), 20);
  };
  const subs = [];
  let pending = null;
  const deliver = (route) => {
    if (subs.length) subs.forEach((cb) => cb(route));
    else pending = route;
  };
  whenReady((t) => t.event.listen('open-route', (e) => deliver(e.payload)));

  const openExternal = (url) => {
    if (!/^https?:/i.test(url)) return;
    whenReady((t) => t.core.invoke('plugin:opener|open_url', { url }));
  };

  window.pasodrumShell = Object.freeze({
    shell: 'tauri',
    notify: ({ title, body, route }) => whenReady((t) => t.event.emit('shell-notify', { title, body, route })),
    setBadge: (unread) => whenReady((t) => t.window.getCurrentWindow().setBadgeCount(unread > 0 ? unread : undefined)),
    openExternal,
    onOpenRoute: (cb) => {
      subs.push(cb);
      if (pending !== null) {
        const r = pending;
        pending = null;
        cb(r);
      }
    },
  });

  document.addEventListener(
    'click',
    (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a || e.defaultPrevented) return;
      const url = new URL(a.href, location.href);
      if (!/^https?:$/.test(url.protocol)) return;
      if (a.target === '_blank' || url.origin !== base) {
        e.preventDefault();
        openExternal(url.href);
      }
    },
    true,
  );
})();
