const fs = require('fs');
const path = require('path');
const os = require('os');
const { detectFileFormat, loadAndNormalize } = require('./parser');
const { categorizeEntry } = require('./categorizer');
const { attachPasswords } = require('./passwordFinder');
const { isValidSecret } = require('./totp');

function isProbablyBinary(filePath, allowBinary) {
  if (allowBinary) return false;
  try {
    const handle = fs.openSync(filePath, 'r');
    const sample = Buffer.alloc(512);
    const bytesRead = fs.readSync(handle, sample, 0, 512, 0);
    fs.closeSync(handle);
    for (let i = 0; i < bytesRead; i += 1) {
      const byte = sample[i];
      if (byte < 9 || (byte > 13 && byte < 32) || byte > 126) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function annotateEntries(entries, filePath, profile, prefs, options = {}) {
  const validate = prefs.validate_otp !== false;
  const prepared = [];
  for (const entry of entries) {
    const next = { ...entry, source_path: filePath, category: categorizeEntry(entry, filePath) };
    if (profile && profile !== 'All Profiles') next.profile = profile;
    else next.profile = next.profile || 'Unassigned';

    const type = String(next.type || 'totp').toLowerCase();
    if (type === 'authy-asset') {
      prepared.push(next);
      continue;
    }
    if (!next.secret) continue;
    if (validate && !isValidSecret(next.secret, next)) continue;
    prepared.push(next);
  }
  if (options.skipPasswords || prefs.skip_passwords) return prepared;
  return attachPasswords(prepared, filePath);
}

function importFile(filePath, options = {}) {
  const prefs = options.prefs || {};
  const profile = options.profile || 'Unassigned';
  const base = path.basename(filePath).toLowerCase();
  let mode = 'otp';
  if (base === '000003.log' || base.includes('000003')) {
    mode = 'otp';
  } else {
    try {
      mode = detectFileFormat(filePath);
    } catch {
      mode = 'otp';
    }
    if (mode === 'all') mode = 'otp';
  }
  const entries = loadAndNormalize(filePath, mode);
  return annotateEntries(entries, filePath, profile, prefs, options);
}

function isScrapeTargetPath(dir) {
  return pathParts(dir).some((part) => {
    const lower = part.toLowerCase();
    return lower === 'auth' || lower === '2fa' || lower.includes('authenticator') || lower.includes('2fa');
  });
}

function shouldSkipScrapeFile(filePath, prefs = {}) {
  const name = path.basename(filePath);
  if (!name.toLowerCase().endsWith('.log')) return true;
  if (name.startsWith('.') || name.endsWith('.tmp')) return true;
  if (name.toLowerCase() === '000003.log') return false;
  if (isScrapeTargetPath(filePath) && name.toLowerCase().includes('000003')) return false;
  if (prefs.scan_binary_files) return false;
  return isProbablyBinary(filePath, false);
}

function shouldSkipDirName(name) {
  const lower = String(name || '').toLowerCase();
  if (!lower) return true;
  if (lower.startsWith('.') && lower !== '.' && lower !== '..') return true;
  return SKIP_DIR_NAMES.has(lower);
}

function findScrapeFiles(rootDir, prefs = {}, onDir) {
  const files = [];
  const stack = [rootDir];
  let scannedDirs = 0;
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    scannedDirs += 1;
    const inTarget = isScrapeTargetPath(dir);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldSkipDirName(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
        continue;
      }
      if (!inTarget) continue;
      const full = path.join(dir, entry.name);
      if (shouldSkipScrapeFile(full, prefs)) continue;
      files.push(full);
    }
    if (onDir && scannedDirs % 80 === 0) onDir(scannedDirs, files.length);
  }
  return files;
}

function yieldTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function scrapeDirectory(rootDir, options = {}) {
  const prefs = { ...(options.prefs || {}), skip_passwords: true };
  const onProgress = options.onProgress || (async () => {});
  await onProgress({ phase: 'scan', label: 'Searching folders…', found: 0 });
  const files = findScrapeFiles(rootDir, prefs, (scannedDirs, found) => {
    onProgress({
      phase: 'scan',
      scannedDirs,
      found,
      label: found ? `Searching… ${found} log${found === 1 ? '' : 's'} found` : 'Searching folders…',
    });
  });
  await onProgress({
    phase: 'scan',
    label: files.length
      ? `Searching… ${files.length} log${files.length === 1 ? '' : 's'} found`
      : 'Searching folders…',
    found: files.length,
    scannedDirs: 0,
    done: true,
  });
  const collected = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const profile = mainFolderName(file);
    await onProgress({
      phase: 'import',
      file,
      profile,
      index,
      total: files.length,
      working: true,
      label: `Reading ${index + 1} of ${files.length}…`,
      entries: [],
    });
    await yieldTick();
    try {
      const size = fs.statSync(file).size;
      if (size > MAX_IMPORT_BYTES) {
        throw new Error(`Skipped ${path.basename(file)} (${Math.round(size / 1024 / 1024)} MB)`);
      }
      const entries = importFile(file, { prefs, profile, skipPasswords: true });
      collected.push(...entries);
      await onProgress({
        phase: 'import',
        file,
        profile,
        index: index + 1,
        total: files.length,
        added: entries.length,
        entries,
        label: `Imported ${index + 1} of ${files.length}`,
      });
    } catch (error) {
      await onProgress({
        phase: 'import',
        file,
        profile,
        index: index + 1,
        total: files.length,
        added: 0,
        entries: [],
        error: String(error.message || error),
        label: `Imported ${index + 1} of ${files.length}`,
      });
    }
    await yieldTick();
  }
  return { files: files.length, entries: collected };
}

function cpuWorkers(requested) {
  const max = Math.max(1, Number(requested || 4));
  return Math.min(max, Math.max(1, os.cpus().length));
}

async function importFiles(paths, options = {}) {
  const collected = [];
  const onProgress = options.onProgress || (async () => {});
  for (let index = 0; index < paths.length; index += 1) {
    const filePath = paths[index];
    try {
      const entries = importFile(filePath, options);
      collected.push(...entries);
      await onProgress({
        phase: 'import',
        file: filePath,
        index: index + 1,
        total: paths.length,
        added: entries.length,
        entries,
      });
    } catch (error) {
      await onProgress({
        phase: 'import',
        file: filePath,
        index: index + 1,
        total: paths.length,
        added: 0,
        entries: [],
        error: String(error.message || error),
      });
    }
    await yieldTick();
  }
  return collected;
}

const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', 'dist', '__pycache__',
  '$recycle.bin', 'system volume information', 'windows', 'windows.old',
  'program files', 'program files (x86)', 'programdata', 'recovery', 'msocache',
  'cache', 'code cache', 'gpucache', 'shadercache', 'grshadercache',
  'service worker', 'service worker cachestorage', 'indexeddb', 'blob_storage',
  'platform notifications', 'file system', 'session storage', 'local storage',
  'pepper data', 'shared dictionary',
  'optimizationguidepredictionmodels', 'safebrowsing', 'crashpad',
  'application cache', 'jumplistdata', 'videodecodestats',
]);

function pathParts(filePath) {
  return path.normalize(filePath).split(/[/\\]/).filter(Boolean);
}

const GENERIC_FOLDER = new Set([
  'wallets', 'wallet', 'plugins', 'plugin', '2fa', 'auth', 'extension', 'extensions',
  'google chrome', 'chrome', 'default', 'sync', 'sync extension settings',
  'local extension settings', 'profile', 'profiles',
]);

function isAuthenticatorLog(filePath) {
  const parts = pathParts(filePath);
  const lower = parts.map((part) => part.toLowerCase());
  if (lower[lower.length - 1] !== '000003.log') return false;
  return lower.some((part) => part.includes('authenticator'));
}

function mainFolderName(filePath) {
  const parts = pathParts(filePath);
  const lower = parts.map((part) => part.toLowerCase());
  const plugins = lower.findIndex((part) => part === 'plugins');
  if (plugins > 0) return parts[plugins - 1];

  let index = lower.findIndex((part) => part.includes('authenticator'));
  if (index < 0) return parts[0] || 'Unassigned';
  index -= 1;
  while (index > 0 && (GENERIC_FOLDER.has(lower[index]) || lower[index].startsWith('profile '))) {
    index -= 1;
  }
  return parts[index] || parts[0] || 'Unassigned';
}

function processAuthenticatorDir(dir, files, stack) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name.toLowerCase())) continue;
      stack.push(full);
      continue;
    }
    if (isAuthenticatorLog(full)) {
      files.push({ file: full, profile: mainFolderName(full) });
    }
  }
}

function findAuthenticatorLogs(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    processAuthenticatorDir(stack.pop(), files, stack);
  }
  return files;
}

async function findAuthenticatorLogsAsync(rootDir, onProgress) {
  const files = [];
  const stack = [rootDir];
  let scannedDirs = 0;
  while (stack.length) {
    processAuthenticatorDir(stack.pop(), files, stack);
    scannedDirs += 1;
    if (onProgress && scannedDirs % 20 === 0) {
      await onProgress({ phase: 'scan', scannedDirs, found: files.length });
      await yieldTick();
    }
  }
  if (onProgress) await onProgress({ phase: 'scan', scannedDirs, found: files.length, done: true });
  return files;
}

const MAX_IMPORT_BYTES = 80 * 1024 * 1024;

async function importAuthenticatorTree(rootDir, options = {}) {
  const prefs = { ...options.prefs, skip_passwords: true };
  const onProgress = options.onProgress || (async () => {});
  await onProgress({ phase: 'scan', scannedDirs: 0, found: 0, label: 'Searching folders…' });
  const found = await findAuthenticatorLogsAsync(rootDir, onProgress);
  const collected = [];
  for (let index = 0; index < found.length; index += 1) {
    const item = found[index];
    await onProgress({
      phase: 'import',
      file: item.file,
      profile: item.profile,
      index,
      total: found.length,
      working: true,
      label: `Reading ${index + 1} of ${found.length}…`,
      entries: [],
    });
    await yieldTick();
    try {
      const size = fs.statSync(item.file).size;
      if (size > MAX_IMPORT_BYTES) {
        throw new Error(`Skipped ${path.basename(item.file)} (${Math.round(size / 1024 / 1024)} MB)`);
      }
      const entries = importFile(item.file, { prefs, profile: item.profile, skipPasswords: true });
      collected.push(...entries);
      await onProgress({
        phase: 'import',
        file: item.file,
        profile: item.profile,
        index: index + 1,
        total: found.length,
        added: entries.length,
        entries,
        label: `Imported ${index + 1} of ${found.length}`,
      });
    } catch (error) {
      await onProgress({
        phase: 'import',
        file: item.file,
        profile: item.profile,
        index: index + 1,
        total: found.length,
        added: 0,
        entries: [],
        error: String(error.message || error),
        label: `Imported ${index + 1} of ${found.length}`,
      });
    }
    await yieldTick();
  }
  return { files: found, entries: collected };
}

module.exports = {
  importFile,
  importFiles,
  scrapeDirectory,
  findScrapeFiles,
  findAuthenticatorLogs,
  importAuthenticatorTree,
  isAuthenticatorLog,
  mainFolderName,
  cpuWorkers,
};
