(async () => {
  try {
    await P.signIn('sofia');
    await P.sleep(6000);
    await P.harness({ text: P.text().slice(0, 400) });
  } catch (e) {
    P.emit('fail', { e: String(e) });
  }
})();
