(async () => {
  await P.waitFor(() => location.pathname !== '/signin', 20000);
  await P.sleep(3000);
  const a = [...document.querySelectorAll('a')].find((x) => x.textContent.trim() === 'general');
  if (a) a.click();
  await P.sleep(2000);
  P.emit('general', { ok: !!a });
})();
