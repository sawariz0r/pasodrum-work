const { contextBridge, ipcRenderer } = require('electron');

let onRoute = null;
let pendingRoute = null;
let onUpdate = null;
let updateReady = false;

ipcRenderer.on('open-route', (_e, route) => (onRoute ? onRoute(route) : (pendingRoute = route)));
ipcRenderer.on('update-ready', () => { updateReady = true; onUpdate?.(); });

contextBridge.exposeInMainWorld('pasodrumShell', {
  shell: 'electron',
  notify: ({ title, body, route, tag }) => ipcRenderer.send('notify', { title, body, route, tag }),
  setBadge: (unread) => ipcRenderer.send('badge', unread),
  openExternal: (url) => ipcRenderer.send('external', url),
  onOpenRoute: (cb) => {
    onRoute = cb;
    if (pendingRoute != null) { cb(pendingRoute); pendingRoute = null; }
  },
  onUpdateReady: (cb) => { onUpdate = cb; if (updateReady) cb(); },
  restartToUpdate: () => ipcRenderer.invoke('restart'),
});
