const fs = require('fs');
const { maybeParseSecret } = require('./uri');

function decodeBytesToText(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buffer.toString('utf8');
}

function recurseExtractStrings(value, results) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          results.push(parsed);
        } else if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === 'object' && !Array.isArray(item)) results.push(item);
          }
        }
      } catch {
        // ignore invalid nested JSON
      }
    }
    return;
  }
  if (value && typeof value === 'object') {
    const values = Array.isArray(value) ? value : Object.values(value);
    for (const item of values) recurseExtractStrings(item, results);
  }
}

function extractCompleteJsonObjectsFromText(text) {
  const objects = [];
  let index = 0;
  let lastProcessed = 0;
  const length = text.length;

  while (true) {
    index = text.indexOf('{', index);
    if (index === -1) {
      lastProcessed = Math.max(lastProcessed, length);
      break;
    }

    let depth = 0;
    let cursor = index;
    let inString = false;
    let escape = false;
    let objectText = null;

    while (cursor < length) {
      const char = text[cursor];
      if (inString) {
        if (escape) escape = false;
        else if (char === '\\') escape = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          objectText = text.slice(index, cursor + 1);
          lastProcessed = cursor + 1;
          break;
        }
      }
      cursor += 1;
    }

    if (objectText === null) break;

    try {
      const parsed = JSON.parse(objectText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        objects.push(parsed);
        const nested = [];
        for (const value of Object.values(parsed)) recurseExtractStrings(value, nested);
        for (const item of nested) {
          if (item && typeof item === 'object' && !Array.isArray(item)) objects.push(item);
        }
      }
    } catch {
      // skip invalid candidate
    }

    index = lastProcessed;
    if (index >= length) break;
  }

  return { objects, lastProcessed };
}

function extractAllJsonObjectsFromBytes(data) {
  return extractCompleteJsonObjectsFromText(decodeBytesToText(data)).objects;
}

function expandBitwardenObjects(allObjects) {
  const expanded = [];
  try {
    for (const object of allObjects) {
      const cipherMap = object && typeof object === 'object'
        ? (object.ciphers || (object.data && object.data.ciphers) || null)
        : null;
      if (cipherMap && typeof cipherMap === 'object' && !Array.isArray(cipherMap)) {
        for (const [cipherId, cipher] of Object.entries(cipherMap)) {
          if (cipher && typeof cipher === 'object' && !Array.isArray(cipher)) {
            expanded.push({ ...cipher, _cipher_id: cipherId, _container: 'bitwarden_export' });
          }
        }
        continue;
      }
      expanded.push(object);
    }
    return expanded;
  } catch {
    return allObjects;
  }
}

function isAuthyObject(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const keys = ['accountName', 'userId', 'email', 'urls', 'menuItemUrl', 'menuItemMd5', 'menu_item_url'];
  if (keys.some((key) => key in object)) return true;
  return Object.values(object).some((value) => {
    if (typeof value !== 'string') return false;
    const lower = value.toLowerCase();
    return value.includes('assets.authy.com') || value.includes('filesystem:') || lower.includes('authy');
  });
}

function parseExportBuffer(data, mode = 'otp', sourcePath = '') {
  let allObjects = expandBitwardenObjects(extractAllJsonObjectsFromBytes(data));
  if (mode === 'all') return allObjects;

  const objects = [];
  for (const object of allObjects) {
    if (mode === 'otp') {
      if (object.dataType === 'OTPStorage' || ('secret' in object && 'account' in object)) {
        objects.push(object);
        continue;
      }
      try {
        if (object && typeof object === 'object' && ('login' in object || String(object.type) === '1')) {
          const login = object.login || {};
          const totp = login.totp || object.totp || null;
          const username = login.username || object.name || object.id;
          if (totp || username) {
            const parsedTotp = maybeParseSecret(totp);
            const entry = {
              account: username,
              issuer: object.name || object.folderId || null,
              secret: parsedTotp ? parsedTotp.secret : totp,
              type: parsedTotp ? parsedTotp.type : 'totp',
              digits: parsedTotp ? parsedTotp.digits : 6,
              period: parsedTotp ? parsedTotp.period : 30,
              algorithm: parsedTotp ? parsedTotp.algorithm : 'SHA1',
              raw: object,
            };
            const password = login.password || object.password;
            if (password) {
              entry.related_passwords = [{
                file: sourcePath,
                line_no: 0,
                key: 'password',
                value: password,
                masked: password,
                type: 'password',
              }];
            }
            objects.push(entry);
          }
        }
      } catch {
        // ignore malformed cipher
      }
    } else if (mode === 'authy' && isAuthyObject(object)) {
      objects.push(object);
    }
  }
  return objects;
}

function parseExportFile(filePath, mode = 'otp') {
  const data = fs.readFileSync(filePath);
  return parseExportBuffer(data, mode, filePath);
}

function normalizeEntry(entry) {
  const next = { ...entry };
  const type = next.type;
  if (type === 1 || type === '1' || type == null) next.type = 'totp';
  else if (type === 2 || type === '2') next.type = 'hotp';
  else if (typeof type === 'string') next.type = type;
  else next.type = 'totp';

  if (typeof next.secret === 'string') {
    const parsed = maybeParseSecret(next.secret);
    if (parsed) {
      next.secret = parsed.secret;
      next.issuer = next.issuer || parsed.issuer;
      next.account = next.account || parsed.account;
      next.type = parsed.type;
      next.digits = parsed.digits;
      next.period = parsed.period;
      next.algorithm = parsed.algorithm;
      next.index = parsed.index;
    } else {
      next.secret = next.secret.trim().replace(/\s+/g, '').toUpperCase();
    }
  }
  next.digits = Number(next.digits || 6);
  next.period = Number(next.period || 30);
  next.algorithm = String(next.algorithm || 'SHA1').toUpperCase();
  next.index = Number(next.index || 0);
  return next;
}

function loadAndNormalize(filePath, mode = 'otp') {
  const rawEntries = parseExportFile(filePath, mode);
  return rawEntries.map((entry) => {
    if (mode === 'authy') {
      return {
        account: entry.accountName || entry.account || entry.uuid || entry.userId,
        issuer: null,
        secret: null,
        type: 'authy-asset',
        raw: entry,
      };
    }
    return normalizeEntry(entry);
  });
}

function detectFileFormat(filePath, readSize = 8192) {
  try {
    const handle = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(readSize);
    const bytesRead = fs.readSync(handle, buffer, 0, readSize, 0);
    fs.closeSync(handle);
    const text = decodeBytesToText(buffer.subarray(0, bytesRead)).toLowerCase();
    if (text.includes('authy.') || text.includes('accountname') || text.includes('menuitemurl')) return 'authy';
    if (text.includes('otpstorage') || (text.includes('secret') && text.includes('account'))) return 'otp';
    return 'all';
  } catch {
    return 'all';
  }
}

module.exports = {
  decodeBytesToText,
  extractCompleteJsonObjectsFromText,
  extractAllJsonObjectsFromBytes,
  parseExportFile,
  parseExportBuffer,
  normalizeEntry,
  loadAndNormalize,
  detectFileFormat,
};
