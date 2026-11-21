// Spike: early console capture (PASODRUM_PROBE_INIT). Probes read window.__LOGS.
(() => {
  if (window.top !== window) return;
  const logs = (window.__LOGS = []);
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
    const o = console[k];
    console[k] = (...a) => {
      try { logs.push(k + ' ' + a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ').slice(0, 400)); } catch {}
      if (logs.length > 3000) logs.splice(0, 1000);
      o.apply(console, a);
    };
  }
  addEventListener('error', (e) => logs.push('onerror ' + e.message));
  addEventListener('unhandledrejection', (e) => logs.push('unhandled ' + String(e.reason && (e.reason.stack || e.reason))));
})();
