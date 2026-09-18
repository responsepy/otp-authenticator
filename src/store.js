const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PREFS = {
  show_passwords_cleartext: true,
  scan_binary_files: false,
  enable_dnd_overlay: true,
  auto_add_path_to_profile: true,
  validate_otp: true,
  show_debug_console: false,
  max_import_workers: 4,
  enabled_types: ['totp', 'hotp', 'authy', 'authy-asset', 'other'],
  theme: 'light',
};

function entryUniqueKey(entry) {
  const issuer = String(entry.issuer || '').toLowerCase().trim();
  const account = String(entry.account || '').toLowerCase().trim();
  let secret = entry.secret || '';
  secret = typeof secret === 'string' ? secret.replace(/\s+/g, '').toUpperCase() : String(secret);
  return `${issuer}|${account}|${secret}|${entry.hash || ''}`;
}

function publicAccount(account) {
  return {
    id: account.id,
    issuer: account.issuer || '',
    account: account.account || '',
    type: account.type || 'totp',
    digits: account.digits || 6,
    period: account.period || 30,
    algorithm: account.algorithm || 'SHA1',
    index: account.index || 0,
    category: account.category || 'Other',
    profile: account.profile || 'Unassigned',
    source_path: account.source_path || '',
    related_passwords: account.related_passwords || [],
    pass_file_credentials: account.pass_file_credentials || [],
    raw: account.raw || null,
    hash: account.hash || '',
    createdAt: account.createdAt,
    is_asset: account.type === 'authy-asset' || Boolean(account.raw && (account.raw.menuItemUrl || account.raw.menu_item_url || account.raw.logo_url)),
  };
}

function createStore(filePath) {
  const state = load(filePath);

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      version: 2,
      accounts: state.accounts,
      profiles: state.profiles,
      prefs: state.prefs,
    }, null, 2));
  }

  function existingKeys() {
    return new Set(state.accounts.map(entryUniqueKey));
  }

  return {
    list() {
      return state.accounts.map(publicAccount);
    },
    all() {
      return state.accounts.slice();
    },
    get(id) {
      return state.accounts.find((item) => item.id === id) || null;
    },
    add(entry) {
      const account = {
        id: crypto.randomUUID(),
        issuer: entry.issuer || '',
        account: entry.account || '',
        secret: entry.secret || null,
        type: entry.type || 'totp',
        digits: Number(entry.digits || 6),
        period: Number(entry.period || 30),
        algorithm: String(entry.algorithm || 'SHA1').toUpperCase(),
        index: Number(entry.index || 0),
        category: entry.category || 'Other',
        profile: entry.profile || 'Unassigned',
        source_path: entry.source_path || '',
        related_passwords: entry.related_passwords || [],
        pass_file_credentials: entry.pass_file_credentials || [],
        raw: entry.raw || null,
        hash: entry.hash || '',
        createdAt: Date.now(),
      };
      state.accounts.push(account);
      persist();
      return publicAccount(account);
    },
    addMany(entries) {
      const keys = existingKeys();
      const added = [];
      for (const entry of entries) {
        const key = entryUniqueKey(entry);
        if (keys.has(key)) continue;
        keys.add(key);
        const account = {
          id: crypto.randomUUID(),
          issuer: entry.issuer || '',
          account: entry.account || '',
          secret: entry.secret || null,
          type: entry.type || 'totp',
          digits: Number(entry.digits || 6),
          period: Number(entry.period || 30),
          algorithm: String(entry.algorithm || 'SHA1').toUpperCase(),
          index: Number(entry.index || 0),
          category: entry.category || 'Other',
          profile: entry.profile || 'Unassigned',
          source_path: entry.source_path || '',
          related_passwords: entry.related_passwords || [],
          pass_file_credentials: entry.pass_file_credentials || [],
          raw: entry.raw || null,
          hash: entry.hash || '',
          createdAt: Date.now(),
        };
        state.accounts.push(account);
        added.push(publicAccount(account));
      }
      if (added.length) persist();
      return added;
    },
    update(id, patch) {
      const index = state.accounts.findIndex((item) => item.id === id);
      if (index === -1) return null;
      state.accounts[index] = { ...state.accounts[index], ...patch, id };
      persist();
      return publicAccount(state.accounts[index]);
    },
    remove(id) {
      const index = state.accounts.findIndex((item) => item.id === id);
      if (index === -1) return false;
      state.accounts.splice(index, 1);
      persist();
      return true;
    },
    listProfiles() {
      return Object.keys(state.profiles).sort();
    },
    createProfile(name) {
      if (!name || state.profiles[name]) return false;
      state.profiles[name] = [];
      persist();
      return true;
    },
    ensureProfile(name) {
      if (!name) return false;
      if (!state.profiles[name]) {
        state.profiles[name] = [];
        persist();
      }
      return true;
    },
    deleteProfile(name) {
      if (!name || name === 'All Profiles') return false;
      const hadProfile = Boolean(state.profiles[name]);
      delete state.profiles[name];
      const before = state.accounts.length;
      state.accounts = state.accounts.filter((account) => account.profile !== name);
      if (!hadProfile && before === state.accounts.length) return false;
      persist();
      return true;
    },
    deleteAllProfiles() {
      const removed = state.accounts.length;
      state.profiles = {};
      state.accounts = [];
      persist();
      return removed;
    },
    renameProfile(oldName, newName) {
      if (!state.profiles[oldName] || !newName || state.profiles[newName]) return false;
      state.profiles[newName] = state.profiles[oldName];
      delete state.profiles[oldName];
      for (const account of state.accounts) {
        if (account.profile === oldName) account.profile = newName;
      }
      persist();
      return true;
    },
    addPathToProfile(profile, filePath) {
      if (!state.profiles[profile]) return false;
      if (!state.profiles[profile].includes(filePath)) {
        state.profiles[profile].push(filePath);
        persist();
      }
      return true;
    },
    prefs() {
      return { ...state.prefs };
    },
    setPrefs(patch) {
      state.prefs = { ...state.prefs, ...patch };
      persist();
      return { ...state.prefs };
    },
  };
}

function load(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      profiles: raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {},
      prefs: { ...DEFAULT_PREFS, ...(raw.prefs || {}) },
    };
  } catch {
    return { accounts: [], profiles: {}, prefs: { ...DEFAULT_PREFS } };
  }
}

module.exports = { createStore, entryUniqueKey, DEFAULT_PREFS };
