const { contextBridge, ipcRenderer } = require('electron');
let webUtils = null;
try {
  ({ webUtils } = require('electron'));
} catch {
  webUtils = null;
}

function filePath(file) {
  if (!file) return '';
  if (file.path) return file.path;
  try {
    return webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : '';
  } catch {
    return '';
  }
}

contextBridge.exposeInMainWorld('otp', {
  getState: () => ipcRenderer.invoke('state:get'),
  add: (payload) => ipcRenderer.invoke('accounts:add', payload),
  remove: (id) => ipcRenderer.invoke('accounts:remove', id),
  copyCode: (id) => ipcRenderer.invoke('accounts:copy-code', id),
  copyText: (text) => ipcRenderer.invoke('accounts:copy-text', text),
  copyUri: (id) => ipcRenderer.invoke('accounts:copy-uri', id),
  importFiles: (profile) => ipcRenderer.invoke('import:pick-files', profile),
  importPaths: (paths, profile) => ipcRenderer.invoke('import:paths', paths, profile),
  scrape: () => ipcRenderer.invoke('import:scrape'),
  openSite: (id) => ipcRenderer.invoke('site:open', id),
  openDir: (id) => ipcRenderer.invoke('dir:open', id),
  createProfile: (name) => ipcRenderer.invoke('profiles:create', name),
  renameProfile: (oldName, newName) => ipcRenderer.invoke('profiles:rename', oldName, newName),
  deleteProfile: (name) => ipcRenderer.invoke('profiles:delete', name),
  deleteAllProfiles: () => ipcRenderer.invoke('profiles:delete-all'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  pathForFile: filePath,
  onState: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
  onProgress: (handler) => {
    const listener = (_event, progress) => handler(progress);
    ipcRenderer.on('import:progress', listener);
    return () => ipcRenderer.removeListener('import:progress', listener);
  },
  onMenu: (handler) => {
    const events = ['menu:import', 'menu:scrape', 'menu:add', 'menu:prefs', 'menu:profiles', 'menu:delete-all-profiles', 'menu:about'];
    const listeners = events.map((name) => {
      const listener = () => handler(name.replace('menu:', ''));
      ipcRenderer.on(name, listener);
      return [name, listener];
    });
    return () => {
      for (const [name, listener] of listeners) ipcRenderer.removeListener(name, listener);
    };
  },
});
