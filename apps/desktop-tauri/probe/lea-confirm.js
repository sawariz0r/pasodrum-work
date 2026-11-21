(async () => {
  // Lea's new device: press "Email me a link" once (local Mailpit), then keep the page open.
  await P.waitFor(() => location.pathname !== '/signin', 20000);
  if (sessionStorage.confirmAsked) return P.emit('confirm', { page: location.pathname, main: (document.querySelector('main') || document.body).innerText.slice(0, 300) });
  await P.sleep(3000);
  const click = (sel, re) => { const el = [...document.querySelectorAll(sel)].find((x) => re.test(x.textContent.trim())); if (el) el.click(); return !!el; };
  click('a,button', /^DMs/);
  await P.sleep(1500);
  click('a,button,[role=option],li', /^IH\s*Ingrid Holm|^Ingrid Holm/);
  await P.sleep(2500);
  const b = await P.waitFor(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Email me a link'), 15000);
  if (!b) return P.emit('confirm', { error: 'no email button' });
  sessionStorage.confirmAsked = '1';
  b.click();
  await P.sleep(3000);
  P.emit('confirm', { clicked: true, main: (document.querySelector('main') || document.body).innerText.slice(0, 300) });
})();
