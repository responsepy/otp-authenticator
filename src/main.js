const { app, BrowserWindow, ipcMain, clipboard, Menu, nativeTheme, dialog, shell, Notification } = require('electron');
const path = require('path');
const { createStore } = require('./store');
const { generateTOTP, generateHOTP, remainingSeconds, isValidSecret } = require('./totp');
const { parseOtpAuth, toOtpAuth } = require('./uri');
const { importFiles } = require('./importer');
const { scrapeInWorker } = require('./jobs');
const { categorizeEntry, countCategories, CATEGORY_COLORS } = require('./categorizer');
const { guessSiteForEntry, normalizeUrl, KNOWN_SITES } = require('./siteResolver');
const { openDirectory, informativeAncestorDirectory, shortSourceLabel } = require('./fileUtils');
const { findPasswordsTxtInAncestors, findCredentialsInPassFiles, searchPasswordsNearLogin } = require('./passwordFinder');

let store;
let mainWindow;
let importing = false;

function iconPath() {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, '../build', file);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 760,
    minHeight: 560,
    title: 'OTP Authenticator',
    icon: iconPath(),
    backgroundColor: '#e8edf2',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function decorateAccount(account) {
  const publicAccount = {
    id: account.id,
    issuer: account.issuer,
    account: account.account,
    type: account.type,
    digits: account.digits,
    period: account.period,
    algorithm: account.algorithm,
    index: account.index,
    category: account.category,
    profile: account.profile,
    source_path: account.source_path,
    related_passwords: account.related_passwords || [],
    pass_file_credentials: account.pass_file_credentials || [],
    raw: account.raw || null,
    createdAt: account.createdAt,
    is_asset: account.type === 'authy-asset' || Boolean(account.raw && (account.raw.menuItemUrl || account.raw.menu_item_url || account.raw.logo_url)),
    site: guessSiteForEntry(account),
    source_label: shortSourceLabel(account.source_path),
    category_color: CATEGORY_COLORS[account.category] || CATEGORY_COLORS.Other,
    password_count: (account.related_passwords || []).filter(isPasswordEntry).length,
    login_count: (account.pass_file_credentials || []).length,
    code: '-',
    remaining: 0,
  };

  if (!account.secret || publicAccount.is_asset) {
    publicAccount.code = publicAccount.is_asset ? 'ASSET' : '-';
    publicAccount.remaining = 0;
    return publicAccount;
  }

  try {
    if (String(account.type || 'totp').toLowerCase() === 'hotp') {
      publicAccount.code = generateHOTP(account.secret, account.index || 0, account);
      publicAccount.remaining = 0;
    } else {
      publicAccount.code = generateTOTP(account.secret, account);
      publicAccount.remaining = remainingSeconds(account.period);
    }
  } catch {
    publicAccount.code = 'ERR';
    publicAccount.remaining = 0;
  }
  return publicAccount;
}

function snapshot() {
  const accounts = store.all().map(decorateAccount);
  return {
    accounts,
    profiles: store.listProfiles(),
    prefs: store.prefs(),
    counts: countCategories(accounts),
    importing,
  };
}

function isPasswordEntry(item) {
  const type = String(item.type || '').toLowerCase();
  if (type) return type === 'password';
  const key = String(item.key || '').toLowerCase();
  const value = String(item.value || '');
  if (key.includes('pass') || key.includes('pwd') || key.includes('secret')) return true;
  if (!value || value.includes('http') || value.includes('/') || /^[^\s]+@[^\s]+$/.test(value)) return false;
  return Boolean(value.trim());
}

function notify(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch {
    // ignore notification failures
  }
}

function sendState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:changed', snapshot());
  }
}

function emitProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('import:progress', payload);
  }
}

function progressPayload(progress, extras = {}) {
  const fileName = progress.file ? path.basename(progress.file) : '';
  return {
    phase: progress.phase || 'import',
    index: progress.index || 0,
    total: progress.total || 0,
    found: progress.found || 0,
    scannedDirs: progress.scannedDirs || 0,
    working: Boolean(progress.working),
    profile: progress.profile || extras.profile || null,
    file: fileName,
    label: progress.label || extras.label || '',
    added: extras.added || 0,
    error: progress.error || null,
  };
}

async function runImport(paths, profile) {
  if (!paths.length) return snapshot();
  importing = true;
  sendState();
  emitProgress({ phase: 'import', index: 0, total: paths.length, label: 'Importing files…' });
  const prefs = store.prefs();
  const addedAll = [];
  await importFiles(paths, {
    prefs,
    profile,
    onProgress: async (progress) => {
      const added = store.addMany(progress.entries || [], { persist: false });
      addedAll.push(...added);
      if (prefs.auto_add_path_to_profile && profile && profile !== 'All Profiles') {
        store.addPathToProfile(profile, progress.file, { persist: false });
      }
      emitProgress(progressPayload(progress, { added: added.length, label: 'Importing files…' }));
    },
  });
  store.flush();
  importing = false;
  const state = snapshot();
  notify('Import complete', `${addedAll.length} accounts added`);
  sendState();
  return state;
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Import…', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:import') },
        { label: 'Scrape Directory…', accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow?.webContents.send('menu:scrape') },
        { label: 'Add Account…', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:add') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu:prefs') },
      ],
    },
    {
      label: 'Profiles',
      submenu: [
        { label: 'Manage Profiles…', click: () => mainWindow?.webContents.send('menu:profiles') },
        { label: 'Delete All Profiles', click: () => mainWindow?.webContents.send('menu:delete-all-profiles') },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'About', click: () => mainWindow?.webContents.send('menu:about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  store = createStore(path.join(app.getPath('userData'), 'state.json'));
  nativeTheme.themeSource = store.prefs().theme === 'dark' ? 'dark' : 'light';
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, '../build/icon.png'));
  }
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('state:get', () => snapshot());

ipcMain.handle('accounts:add', (_event, payload) => {
  const entry = payload?.uri ? parseOtpAuth(payload.uri) : {
    issuer: String(payload?.issuer || '').trim(),
    account: String(payload?.account || '').trim(),
    secret: String(payload?.secret || '').replace(/[\s-]+/g, ''),
    type: String(payload?.type || 'totp').toLowerCase(),
    digits: Number(payload?.digits || 6),
    period: Number(payload?.period || 30),
    algorithm: String(payload?.algorithm || 'SHA1').toUpperCase(),
    index: Number(payload?.index || 0),
  };
  if (!entry.secret) throw new Error('Secret is required');
  if (!entry.issuer && !entry.account) entry.account = 'Account';
  if (!isValidSecret(entry.secret, entry)) throw new Error('Invalid OTP secret');
  entry.category = categorizeEntry(entry);
  entry.profile = payload?.profile && payload.profile !== 'All Profiles' ? payload.profile : 'Unassigned';
  store.add(entry);
  return snapshot();
});

ipcMain.handle('accounts:remove', (_event, id) => {
  store.remove(String(id));
  return snapshot();
});

ipcMain.handle('accounts:copy-code', (_event, id) => {
  const account = store.get(String(id));
  if (!account) throw new Error('Account not found');
  if (!account.secret) throw new Error('No OTP secret available for this entry');
  const code = String(account.type || 'totp').toLowerCase() === 'hotp'
    ? generateHOTP(account.secret, account.index || 0, account)
    : generateTOTP(account.secret, account);
  clipboard.writeText(code);
  notify('OTP copied', `Code ${code} copied to clipboard`);
  return code;
});

ipcMain.handle('accounts:copy-text', (_event, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});

ipcMain.handle('accounts:copy-uri', (_event, id) => {
  const account = store.get(String(id));
  if (!account) throw new Error('Account not found');
  if (!account.secret) throw new Error('No OTP secret available for this entry');
  clipboard.writeText(toOtpAuth(account));
  return true;
});

ipcMain.handle('import:pick-files', async (_event, profile) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select export file(s)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Export files', extensions: ['log', 'txt', 'json'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return snapshot();
  return runImport(result.filePaths, profile);
});

ipcMain.handle('import:paths', (_event, paths, profile) => {
  const list = (paths || []).filter(Boolean);
  return runImport(list, profile);
});

ipcMain.handle('import:scrape', async (_event, profile) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a directory to scrape',
    properties: ['openDirectory', 'treatPackageAsDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return snapshot();

  importing = true;
  sendState();
  emitProgress({ phase: 'scan', label: 'Searching folders…', found: 0 });
  const prefs = store.prefs();
  const addedAll = [];
  const profiles = new Set();
  try {
    const scraped = await scrapeInWorker(result.filePaths[0], prefs, (progress) => {
      if (progress.phase === 'scan') {
        emitProgress(progressPayload(progress, { label: progress.label || 'Searching folders…' }));
        return;
      }
      if (progress.profile) {
        store.ensureProfile(progress.profile, { persist: false });
        if (progress.file) store.addPathToProfile(progress.profile, progress.file, { persist: false });
        profiles.add(progress.profile);
      }
      const added = store.addMany(progress.entries || [], { persist: false });
      addedAll.push(...added);
      emitProgress(progressPayload(progress, {
        added: added.length,
        label: progress.label || 'Importing logs…',
      }));
    });
    store.flush();
    notify(
      'Scrape complete',
      scraped.files
        ? `${addedAll.length} accounts from ${scraped.files} log${scraped.files === 1 ? '' : 's'} in ${profiles.size} profile${profiles.size === 1 ? '' : 's'}`
        : 'No Auth / 2FA / Authenticator logs found'
    );
    importing = false;
    const state = snapshot();
    sendState();
    return { ...state, scrapedFiles: scraped.files, scannedProfiles: Array.from(profiles) };
  } catch (error) {
    importing = false;
    sendState();
    notify('Scrape failed', String(error.message || error));
    throw error;
  }
});

ipcMain.handle('site:open', async (_event, id) => {
  const account = store.get(String(id));
  if (!account) throw new Error('Account not found');

  let url = null;
  const issuer = String(account.issuer || '').toLowerCase();
  for (const [keyword, mapped] of Object.entries(KNOWN_SITES)) {
    if (issuer.includes(keyword)) {
      url = mapped;
      break;
    }
  }
  if (!url && account.source_path) {
    const fromTxt = findPasswordsTxtInAncestors(account.source_path);
    url = (fromTxt.find((item) => item.url) || {}).url || null;
    if (!url) {
      const creds = findCredentialsInPassFiles(account.source_path);
      url = (creds.find((item) => item.url) || {}).url || null;
    }
    if (!url && account.account) {
      const near = searchPasswordsNearLogin(account.source_path, account.account);
      for (const item of near) {
        const hay = [item.key, item.value, item.match_line, item.file].join(' ');
        const match = hay.match(/(https?:\/\/[A-Za-z0-9./?=&%_-]+)|([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
        if (match) {
          url = match[1] || match[2];
          break;
        }
      }
    }
  }
  if (!url) url = guessSiteForEntry(account);
  url = normalizeUrl(url);
  if (!url) throw new Error('Could not determine a website for this account');
  await shell.openExternal(url);
  return url;
});

ipcMain.handle('dir:open', async (_event, id) => {
  const account = store.get(String(id));
  if (!account || !account.source_path) throw new Error('No source path available for this entry');
  const target = informativeAncestorDirectory(account.source_path);
  const ok = await openDirectory(target);
  if (!ok) throw new Error('Directory not found for this entry');
  return target;
});

ipcMain.handle('profiles:create', (_event, name) => {
  if (!store.createProfile(String(name || '').trim())) throw new Error('Profile already exists or invalid name');
  return snapshot();
});

ipcMain.handle('profiles:rename', (_event, oldName, newName) => {
  if (!store.renameProfile(String(oldName || ''), String(newName || '').trim())) {
    throw new Error('Could not rename profile');
  }
  return snapshot();
});

ipcMain.handle('profiles:delete', (_event, name) => {
  if (!store.deleteProfile(String(name || ''))) throw new Error('Could not delete profile');
  return snapshot();
});

ipcMain.handle('profiles:delete-all', () => {
  store.deleteAllProfiles();
  return snapshot();
});

ipcMain.handle('prefs:set', (_event, patch) => {
  const prefs = store.setPrefs(patch || {});
  if (prefs.theme === 'dark' || prefs.theme === 'light') {
    nativeTheme.themeSource = prefs.theme;
  }
  return snapshot();
});
