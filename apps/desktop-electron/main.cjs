const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.PASODRUM_URL || (app.isPackaged ? 'https://pasodrum.work' : 'http://localhost:4173');
const ORIGIN = new URL(BASE).origin;
const BOUNDS = path.join(app.getPath('userData'), 'window.json');

let win = null;
let quitting = false;
let updater = null;
let updateReady = false;
let squirrelReady = false;
let restarting = null;
let failRestart = null;
const notes = new Map();

const EN = {
  about: 'About Pasodrum work', restart: 'Restart to Update', check: 'Check for Updates…', settings: 'Settings…',
  hide: 'Hide Pasodrum work', quit: 'Quit Pasodrum work', file: 'File', edit: 'Edit', view: 'View', window: 'Window',
  help: 'Help', upToDate: 'You’re up to date', updateFailed: 'Couldn’t install the update', download: 'Download', later: 'Later',
};
const JA = {
  about: 'Pasodrum work について', restart: '再起動して更新', check: '更新を確認…', settings: '設定…',
  hide: 'Pasodrum work を非表示', quit: 'Pasodrum work を終了', file: 'ファイル', edit: '編集', view: '表示', window: 'ウインドウ',
  help: 'ヘルプ', upToDate: '最新の状態です', updateFailed: '更新をインストールできませんでした', download: 'ダウンロード', later: 'あとで',
};
let L = EN;

function log(level, ...parts) {
  const text = parts.map((p) => (p instanceof Error ? p.stack : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  try {
    fs.mkdirSync(app.getPath('logs'), { recursive: true });
    fs.appendFileSync(path.join(app.getPath('logs'), 'updater.log'), `${new Date().toISOString()} ${level} ${text}\n`);
  } catch {}
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function show() {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openRoute(route) {
  if (!win) return;
  show();
  win.webContents.send('open-route', route);
}

function install() {
  quitting = true;
  updater.quitAndInstall();
}

// Resolves only if the restart failed (on success the app quits). electron-updater reports a download before
// Squirrel has the update, and Squirrel can fail to prepare it; then ask Squirrel again instead of waiting forever.
function restart() {
  if (restarting) return restarting;
  log('info', `restart requested (squirrel ready: ${squirrelReady})`);
  restarting = new Promise((resolve) => { failRestart = resolve; });
  if (squirrelReady) install();
  else require('electron').autoUpdater.checkForUpdates();
  return restarting;
}

function restartFailed() {
  const done = failRestart;
  restarting = failRestart = null;
  done();
  dialog.showMessageBox({ type: 'warning', message: L.updateFailed, buttons: [L.download, L.later], defaultId: 0, cancelId: 1 })
    .then(({ response }) => { if (response === 0) openExternal(new URL('/download/mac', BASE).href); });
}

async function checkNow() {
  const result = updater && (await updater.checkForUpdates().catch(() => null));
  if (!updater || (result && !result.isUpdateAvailable)) dialog.showMessageBox({ message: L.upToDate });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about', label: L.about },
        updateReady ? { label: L.restart, click: () => void restart() } : { label: L.check, click: checkNow },
        { type: 'separator' },
        { label: L.settings, accelerator: 'Cmd+,', click: () => openRoute('/settings') },
        { type: 'separator' },
        { role: 'hide', label: L.hide },
        { role: 'quit', label: L.quit },
      ],
    },
    { role: 'fileMenu', label: L.file },
    { role: 'editMenu', label: L.edit },
    { role: 'viewMenu', label: L.view },
    { role: 'windowMenu', label: L.window },
    { role: 'help', label: L.help, submenu: [] },
  ]));
}

function startUpdater() {
  updater = require('electron-updater').autoUpdater;
  updater.logger = { info: (m) => log('info', m), warn: (m) => log('warn', m), error: (m) => log('error', m), debug: () => {} };
  if (process.env.PASODRUM_FEED) updater.setFeedURL({ provider: 'generic', url: process.env.PASODRUM_FEED });
  updater.on('update-downloaded', () => {
    updateReady = true;
    buildMenu();
    win?.webContents.send('update-ready');
  });
  // Registered after electron-updater's own listener (its constructor ran on the line above).
  require('electron').autoUpdater.on('update-downloaded', () => {
    squirrelReady = true;
    if (restarting) install();
  });
  updater.on('error', () => {
    quitting = false;
    if (!restarting) return;
    squirrelReady = false;
    restartFailed();
  });
  const check = () => updater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}

function saved() {
  try {
    const b = JSON.parse(fs.readFileSync(BOUNDS, 'utf8'));
    const a = screen.getDisplayMatching(b).workArea;
    if (b.x < a.x + a.width && b.x + b.width > a.x && b.y >= a.y && b.y < a.y + a.height) return b;
  } catch {}
  return { width: 1280, height: 800 };
}

function save(w, inset) {
  fs.writeFileSync(BOUNDS, JSON.stringify({ ...w.getNormalBounds(), inset }));
}

// Our 40 px title bar exists only in pages that draw it (`<html data-desktop>`). Any other page (an older web
// version, a non-app page) gets the native title bar, so the window buttons never sit on its content.
function createWindow(url = BASE, { inset, ...bounds } = saved()) {
  const w = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    title: 'Pasodrum work',
    ...(inset ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 13 } } : {}),
    backgroundColor: '#18171D',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, backgroundThrottling: false },
  });
  win = w;
  const web = w.webContents;
  web.setWindowOpenHandler(({ url: to }) => {
    if (new URL(to).origin === ORIGIN) w.loadURL(to);
    else openExternal(to);
    return { action: 'deny' };
  });
  web.on('will-navigate', (e, to) => {
    if (new URL(to).origin !== ORIGIN) { e.preventDefault(); openExternal(to); }
  });
  web.on('did-fail-load', (_e, code, _desc, failed, isMainFrame) => {
    if (isMainFrame && code !== -3) w.loadFile(path.join(__dirname, 'offline.html'), { query: { to: failed } });
  });
  web.on('did-finish-load', async () => {
    const draws = await web.executeJavaScript("document.documentElement.hasAttribute('data-desktop')").catch(() => false);
    if (draws !== !!inset) {
      save(w, draws);
      createWindow(web.getURL(), { ...w.getNormalBounds(), inset: draws });
      w.destroy();
    } else if (updateReady) web.send('update-ready');
  });
  w.on('close', (e) => {
    save(w, !!inset);
    if (quitting) return;
    e.preventDefault();
    if (w.isFullScreen()) { w.once('leave-full-screen', () => w.hide()); w.setFullScreen(false); }
    else w.hide();
  });
  w.on('closed', () => { if (win === w) win = null; });
  w.loadURL(url);
}

ipcMain.on('notify', (_e, { title, body, route, tag }) => {
  const key = String(tag ?? route);
  notes.get(key)?.close();
  const n = new Notification({ title: String(title), body: String(body) });
  notes.set(key, n);
  n.on('click', () => openRoute(String(route)));
  n.on('close', () => { if (notes.get(key) === n) notes.delete(key); });
  n.show();
});
ipcMain.on('badge', (_e, n) => app.dock.setBadge(n > 99 ? '99+' : n > 0 ? String(n) : ''));
ipcMain.on('external', (_e, url) => openExternal(String(url)));
ipcMain.handle('restart', () => (updateReady ? restart() : undefined));

if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => win && show());
app.on('before-quit', () => { quitting = true; });
app.on('activate', () => (win ? show() : createWindow()));

app.whenReady().then(() => {
  if (app.getLocale().startsWith('ja')) L = JA;
  buildMenu();
  createWindow();
  if (app.isPackaged) startUpdater();
});
