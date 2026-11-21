const { app, BrowserWindow, Notification, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.PASODRUM_URL || 'http://localhost:4173';
const SCHEME = 'pasodrum-electron';

let win = null;
let coldRoute = '';
const notes = new Set();

function log(...a) {
  const line = `${new Date().toISOString()} ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'shell.log'), line); } catch {}
}

function routeOf(link) {
  try { const u = new URL(link); return u.pathname + u.search + u.hash; } catch { return null; }
}

function isHttp(url) { return /^https?:\/\//i.test(url); }

function openExternal(url) { if (isHttp(url)) { log('external', url); shell.openExternal(url); } }

function show() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  app.focus({ steal: true });
}

function openRoute(route) {
  log('open-route', route);
  if (!win) { coldRoute = route; return; }
  show();
  win.webContents.send('open-route', route);
}

function handleLink(link) {
  const route = routeOf(link);
  if (route != null) openRoute(route);
}

if (!app.requestSingleInstanceLock()) app.exit(0);

app.on('second-instance', (_e, argv) => {
  const link = argv.find((a) => a.startsWith(`${SCHEME}://`));
  if (link) handleLink(link); else show();
});

app.on('open-url', (e, link) => { e.preventDefault(); log('open-url', link); handleLink(link); });

app.setAsDefaultProtocolClient(SCHEME);

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Pasodrum',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const origin = new URL(BASE).origin;
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== origin) { e.preventDefault(); openExternal(url); }
  });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') log('console', e.level, e.message);
  });
  win.on('closed', () => { win = null; });
  win.loadURL(BASE + coldRoute);
  coldRoute = '';
}

ipcMain.on('notify', (_e, { title, body, route }) => {
  const n = new Notification({ title: String(title), body: String(body) });
  notes.add(n);
  n.on('click', () => { notes.delete(n); log('notification-click', route); openRoute(String(route)); });
  n.on('close', () => notes.delete(n));
  n.on('show', () => log('notification-show', title));
  n.on('failed', (_ev, err) => log('notification-failed', err));
  n.show();
});

ipcMain.on('badge', (_e, n) => { app.setBadgeCount(Number(n) || 0); log('badge', app.getBadgeCount()); });

ipcMain.on('external', (_e, url) => openExternal(String(url)));

function checkUpdates() {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = { info: (m) => log('upd', m), warn: (m) => log('upd-warn', m), error: (m) => log('upd-err', String(m)), debug: (m) => log('upd-dbg', m) };
  for (const ev of ['checking-for-update', 'update-available', 'update-not-available', 'download-progress', 'update-downloaded', 'error']) {
    autoUpdater.on(ev, (x) => {
      log('update-event', ev, ev === 'error' ? String(x && x.stack || x) : x && x.version);
      if (ev === 'update-downloaded') setTimeout(() => autoUpdater.quitAndInstall(), 2000);
    });
  }
  autoUpdater.checkForUpdates().catch((err) => log('update-check-failed', String(err)));
}

app.whenReady().then(() => {
  log('ready', app.getVersion(), process.versions.electron, process.versions.chrome);
  createWindow();
  if (process.argv.includes('--check-update')) setTimeout(checkUpdates, 3000);
  app.on('activate', () => { if (!win) createWindow(); else show(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
