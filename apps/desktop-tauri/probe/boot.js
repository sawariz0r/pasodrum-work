(async () => {
  // Reports boot progress every 3 s for 30 s, each storage call with its own timeout.
  const t = (p, ms = 2000) => Promise.race([p, P.sleep(ms).then(() => 'TIMEOUT')]);
  for (let i = 0; i < 10; i++) {
    P.emit('boot', {
      i,
      bodyLen: document.body.innerText.length,
      dbs: await t(indexedDB.databases().then((d) => d.map((x) => x.name))),
      est: await t(navigator.storage.estimate()),
      logs: (window.__LOGS || []).filter((l) => !/LL: telling/.test(l)).slice(-4).map((l) => l.slice(0, 200)),
    });
    await P.sleep(3000);
  }
})();
