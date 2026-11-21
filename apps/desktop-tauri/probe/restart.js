(async () => {
  await P.waitFor(() => location.pathname !== '/signin', 20000);
  await P.sleep(8000);
  await P.harness({ onSignin: location.pathname === '/signin' });
})();
