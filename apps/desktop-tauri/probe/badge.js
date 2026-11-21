(async () => {
  await P.sleep(2000);
  const w = window.__TAURI__.window.getCurrentWindow();
  const r = {};
  try { await w.setBadgeCount(7); r.set7 = 'ok'; } catch (e) { r.set7 = String(e); }
  await P.sleep(4000);
  try { await w.setBadgeCount(undefined); r.clear = 'ok'; } catch (e) { r.clear = String(e); }
  P.emit('badge-await', r);
})();
