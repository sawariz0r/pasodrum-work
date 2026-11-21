// Spike probe prelude: evaluated by the shell on each page load when PASODRUM_PROBE=<file> is set.
var P = (window.__P = window.__P || { errors: [] });
P.emit = (tag, data = {}) => window.__TAURI__.event.emit('probe', { tag, path: location.pathname + location.search, ...data });
P.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
P.waitFor = async (fn, ms = 30000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = fn();
    if (v) return v;
    await P.sleep(250);
  }
  return null;
};
P.setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
P.text = () => document.body.innerText;
if (!P.hooked) {
  P.hooked = true;
  addEventListener('error', (e) => P.errors.push(String(e.message)));
  const ce = console.error;
  console.error = (...a) => {
    P.errors.push(a.map(String).join(' ').slice(0, 300));
    ce.apply(console, a);
  };
}
P.signIn = async (user) => {
  const email = await P.waitFor(() => document.querySelector('input[type=email]'), 6000);
  if (!email) return P.emit('signin', { already: true });
  P.setVal(email, user);
  email.form.requestSubmit();
  const pw = await P.waitFor(() => document.querySelector('input[type=password]'), 15000);
  if (!pw) return P.emit('signin', { error: 'no password field', text: P.text().slice(0, 300) });
  P.setVal(pw, 'pasodrum-dev-password');
  await P.sleep(100);
  pw.form.requestSubmit();
  await P.waitFor(() => location.pathname !== '/signin', 30000);
  P.emit('signin', { done: true });
};
P.harness = async (extra = {}) => {
  const r = {
    ua: navigator.userAgent,
    shell: window.pasodrumShell && window.pasodrumShell.shell,
    secure: isSecureContext,
    persisted: await navigator.storage.persisted().catch((e) => String(e)),
    persist: await navigator.storage.persist().catch((e) => String(e)),
    estimate: await navigator.storage.estimate().catch((e) => String(e)),
    locks: 'locks' in navigator,
    bc: typeof BroadcastChannel,
    dbs: (await indexedDB.databases()).map((d) => d.name),
    session: Object.keys(localStorage),
    device: (() => { try { const j = JSON.parse(localStorage.getItem('pasodrum.session') || '{}'); return j.deviceId || j.device_id || Object.keys(j); } catch (e) { return String(e); } })(),
    cryptoLogs: (window.__LOGS || []).filter((l) => /matrix_sdk_crypto|initRustCrypto|olm|store/i.test(l) && !/LL: telling/.test(l)).slice(0, 6).map((l) => l.slice(0, 160)),
    wasm: performance.getEntriesByType('resource').filter((e) => /\.wasm/.test(e.name)).map((e) => e.name.split('/').pop() + ' ' + Math.round(e.duration) + 'ms'),
    errors: P.errors.slice(0, 10),
    ...extra,
  };
  P.emit('harness', r);
  return r;
};
