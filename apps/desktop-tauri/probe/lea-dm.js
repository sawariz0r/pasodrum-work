(async () => {
  // Lea (confirmed device): open the encrypted DM with Ingrid, send a marker once, report what decrypts.
  await P.waitFor(() => location.pathname !== '/signin', 20000);
  await P.sleep(4000);
  const click = (sel, re) => { const el = [...document.querySelectorAll(sel)].find((x) => re.test(x.textContent.trim())); if (el) el.click(); return !!el; };
  click('a,button', /^DMs/);
  await P.sleep(1500);
  const list = (document.querySelector('nav, aside') || document.body).innerText;
  click('a,button,li', /^IH\s*Ingrid Holm/);
  await P.sleep(4000);
  if (!localStorage.getItem('probeMarker')) {
    const ed = await P.waitFor(() => document.querySelector('.ProseMirror[contenteditable=true]'), 10000);
    if (!ed) return P.emit('dm', { error: 'no composer', main: (document.querySelector('main') || document.body).innerText.slice(0, 400) });
    const m = 'tauri-probe-' + Date.now();
    ed.focus();
    document.execCommand('insertText', false, m);
    await P.sleep(300);
    const btn = document.querySelector('button[aria-label="Send message"]');
    if (btn) btn.click();
    else ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    localStorage.setItem('probeMarker', m);
    await P.sleep(5000);
  }
  const want = localStorage.getItem('probeMarker');
  const main = (document.querySelector('main') || document.body).innerText;
  const body = document.body.innerText;
  await P.harness({ marker: want, markerVisible: main.includes(want), jonasPreview: (body.match(/Jonas Berg[^\n]*\n[^\n]*\n[^\n]*/) || [''])[0], notAvailable: /Not available on this device|Can.t decrypt|Unable to decrypt/i.test(body), main: main.slice(-300) });
})();
