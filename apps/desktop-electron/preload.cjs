const { contextBridge, ipcRenderer } = require('electron');

const subs = [];
let pending = null;

ipcRenderer.on('open-route', (_e, route) => {
  if (subs.length) subs.forEach((cb) => cb(route));
  else pending = route;
});

contextBridge.exposeInMainWorld('pasodrumShell', {
  shell: 'electron',
  notify: (n) => ipcRenderer.send('notify', { title: n.title, body: n.body, route: n.route }),
  setBadge: (unread) => ipcRenderer.send('badge', unread),
  openExternal: (url) => ipcRenderer.send('external', url),
  onOpenRoute: (cb) => {
    subs.push(cb);
    if (pending != null) { const r = pending; pending = null; cb(r); }
  },
});
