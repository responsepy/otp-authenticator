const fs = require('fs');
const path = require('path');
const { minimatch } = require('./minimatch');

const PASSWORD_PATTERNS = [
  /\b(password|passwd|pwd|pw|passphrase|secret)\b\s*[:=]\s*['"]?([^'"\s,;]+)/i,
  /"(password|passwd|pwd|pw|secret)"\s*:\s*"([^"]+)"/i,
  /(?<k>pwd|pw)\s*=\s*(?<v>[^\s;,&]+)/i,
];

const USER_PATTERNS = [
  /\b(user|username|login|email|acct)\b\s*[:=]\s*([^\s,;]+)/i,
];

const TEXT_FILE_EXT = new Set(['.txt', '.log', '.json', '.csv', '.ini', '.conf', '.env']);

function isTextFile(filePath) {
  return TEXT_FILE_EXT.has(path.extname(filePath).toLowerCase());
}

function maskValue(value) {
  return value == null ? '' : String(value);
}

function startDirFrom(filePath) {
  return path.resolve(path.dirname(path.dirname(filePath)));
}

function walkShallowFiles(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

function searchRelatedPasswords(filePath, maxDepth = 3, maxFiles = 500) {
  const results = [];
  if (!filePath || !fs.existsSync(filePath)) return results;

  let current = startDirFrom(filePath);
  let depth = 0;
  let visited = 0;
  const checked = new Set();

  while (current && depth <= maxDepth) {
    for (const full of walkShallowFiles(current)) {
      if (visited >= maxFiles) return results;
      if (checked.has(full) || !isTextFile(full)) continue;
      checked.add(full);
      try {
        const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
          for (const pattern of PASSWORD_PATTERNS) {
            const match = pattern.exec(line);
            if (!match) continue;
            const groups = match.slice(1).filter((item) => item !== undefined);
            const key = groups[0] || '';
            const value = groups[groups.length - 1] || '';
            if (!value) continue;
            results.push({
              file: full,
              line_no: index + 1,
              key,
              value,
              masked: maskValue(value),
              type: 'password',
            });
            break;
          }
        });
        visited += 1;
      } catch {
        // skip unreadable files
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    depth += 1;
  }
  return results;
}

function parseCredentialFile(candidate) {
  const results = [];
  const lines = fs.readFileSync(candidate, 'utf8').split(/\r?\n/);
  let currentUrl = null;
  let currentUser = null;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const urlMatch = line.match(/^\s*URL\s*[:=]\s*(.+)$/i);
    if (urlMatch) {
      currentUrl = urlMatch[1].trim();
      return;
    }
    const userMatch = line.match(/^\s*USER\s*[:=]\s*(.+)$/i);
    if (userMatch) {
      currentUser = userMatch[1].trim();
      return;
    }
    const passMatch = line.match(/^\s*PASS\s*[:=]\s*(.+)$/i);
    if (passMatch) {
      const passVal = passMatch[1].trim();
      if (currentUser) {
        results.push({ file: candidate, line_no: lineNo, type: 'login', key: 'user', value: currentUser, masked: maskValue(currentUser), url: currentUrl });
        results.push({ file: candidate, line_no: lineNo, type: 'password', key: 'pass', value: passVal, masked: maskValue(passVal), url: currentUrl });
        currentUser = null;
        currentUrl = null;
        return;
      }
    }

    const pairMatch = line.match(/^\s*(?<left>[^:\s]+)\s*[:=]\s*(?<right>\S+)\s*$/);
    if (pairMatch) {
      const left = pairMatch.groups.left;
      const right = pairMatch.groups.right;
      const emailMatch = right.match(/[\w.+%-]+@[\w.-]+/);
      if (emailMatch && right.slice(emailMatch.index + emailMatch[0].length).includes(':')) {
        const email = emailMatch[0];
        const passPart = right.slice(emailMatch.index + email.length).replace(/^:+/, '');
        if (passPart) {
          results.push({ file: candidate, line_no: lineNo, type: 'login', key: 'email', value: email, masked: maskValue(email) });
          results.push({ file: candidate, line_no: lineNo, type: 'password', key: 'password', value: passPart, masked: maskValue(passPart) });
          return;
        }
      }
      if (/@/.test(right) && !/:/.test(right)) {
        results.push({ file: candidate, line_no: lineNo, type: 'login', key: left, value: right, masked: maskValue(right) });
      } else if (/pass|pwd|secret/i.test(left)) {
        results.push({ file: candidate, line_no: lineNo, type: 'password', key: left, value: right, masked: maskValue(right) });
      } else {
        results.push({ file: candidate, line_no: lineNo, type: 'login', key: left, value: right, masked: maskValue(right) });
      }
      return;
    }

    for (const pattern of USER_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        results.push({ file: candidate, line_no: lineNo, type: 'login', key: match[1], value: match[2], masked: maskValue(match[2]) });
        return;
      }
    }
    for (const pattern of PASSWORD_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        const groups = match.slice(1).filter((item) => item !== undefined);
        const key = groups[0] || 'password';
        const value = groups[groups.length - 1] || '';
        if (value) {
          results.push({ file: candidate, line_no: lineNo, type: 'password', key, value, masked: maskValue(value) });
        }
        return;
      }
    }
  });
  return results;
}

function findPasswordsTxtInAncestors(filePath, filename = 'passwords.txt', maxDepth = 3) {
  const results = [];
  if (!filePath || !fs.existsSync(filePath)) return results;

  let current = startDirFrom(filePath);
  let depth = 0;
  const seen = new Set();

  while (current && depth <= maxDepth) {
    let names = [];
    try {
      names = fs.readdirSync(current);
    } catch {
      names = [];
    }
    for (const name of names) {
      const lower = name.toLowerCase();
      const matches = /[*?]/.test(filename)
        ? minimatch(lower, filename.toLowerCase())
        : lower.includes(filename.toLowerCase());
      if (!matches) continue;
      const candidate = path.join(current, name);
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile() || seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        results.push(...parseCredentialFile(candidate));
      } catch {
        // skip
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    depth += 1;
  }
  return results;
}

function findPasswordPairsInAncestors(filePath, filename = 'passwords.txt', maxDepth = 3, maxGap = 3) {
  const raw = findPasswordsTxtInAncestors(filePath, filename, maxDepth);
  const pairs = [];
  const byFile = {};
  for (const item of raw) {
    (byFile[item.file] ||= []).push(item);
  }
  for (const [file, items] of Object.entries(byFile)) {
    items.sort((a, b) => Number(a.line_no || 0) - Number(b.line_no || 0));
    items.forEach((item, index) => {
      if (!String(item.type || '').includes('login')) return;
      for (let cursor = index; cursor < Math.min(index + maxGap + 1, items.length); cursor += 1) {
        const candidate = items[cursor];
        if (String(candidate.type || '').includes('password')) {
          pairs.push({
            file,
            login: item.value,
            password: candidate.value,
            login_line: item.line_no,
            password_line: candidate.line_no,
            login_item: item,
            password_item: candidate,
          });
          break;
        }
      }
    });
  }
  return pairs;
}

function findCredentialsInPassFiles(filePath, pattern = '*Pass*.txt', maxDepth = 1) {
  const results = [];
  if (!filePath || !fs.existsSync(filePath)) return results;
  let current = startDirFrom(filePath);
  let depth = 0;
  const seen = new Set();

  while (current && depth <= maxDepth) {
    let names = [];
    try {
      names = fs.readdirSync(current);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!minimatch(name.toLowerCase(), pattern.toLowerCase())) continue;
      const full = path.join(current, name);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile() || seen.has(full)) continue;
      seen.add(full);
      try {
        results.push(...parseCredentialFile(full));
      } catch {
        // skip
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    depth += 1;
  }
  return results;
}

function searchPasswordsNearLogin(filePath, login, maxDepth = 3, contextLines = 3, maxFiles = 500) {
  const results = [];
  if (!filePath || !login || !fs.existsSync(filePath)) return results;

  let current = startDirFrom(filePath);
  let depth = 0;
  let visited = 0;
  const checked = new Set();
  const loginLower = String(login).toLowerCase();

  while (current && depth <= maxDepth) {
    for (const full of walkShallowFiles(current)) {
      if (visited >= maxFiles) return results;
      if (checked.has(full) || !isTextFile(full)) continue;
      checked.add(full);
      try {
        const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (!line.toLowerCase().includes(loginLower)) return;
          const start = Math.max(0, idx - contextLines);
          const end = Math.min(lines.length - 1, idx + contextLines);
          for (let i = start; i <= end; i += 1) {
            for (const pattern of PASSWORD_PATTERNS) {
              const match = pattern.exec(lines[i]);
              if (!match) continue;
              const groups = match.slice(1).filter((item) => item !== undefined);
              const key = groups[0] || 'password';
              const value = groups[groups.length - 1] || '';
              if (!value) continue;
              results.push({
                file: full,
                line_no: i + 1,
                key,
                value,
                masked: maskValue(value),
                match_line: line.trim(),
                context: lines.slice(start, end + 1).map((item) => item.trim()),
                type: 'password',
              });
              break;
            }
          }
        });
        visited += 1;
      } catch {
        // skip
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    depth += 1;
  }
  return results;
}

function relevantCredential(cred, entry) {
  const tokens = new Set();
  for (const value of [entry.account, entry.issuer]) {
    const text = String(value || '').toLowerCase();
    if (!text) continue;
    tokens.add(text);
    for (const token of text.split(/\W+/)) {
      if (token) tokens.add(token);
    }
  }
  if (!tokens.size) return false;
  const hay = ['key', 'value', 'match_line', 'file'].map((key) => String(cred[key] || '')).join(' ').toLowerCase();
  for (const token of tokens) {
    if (token && hay.includes(token)) return true;
  }
  return false;
}

function attachPasswords(entries, filePath) {
  const baseFound = searchRelatedPasswords(filePath);
  const txtPairs = findPasswordPairsInAncestors(filePath, 'passwords.txt', 10);
  const creds = findCredentialsInPassFiles(filePath, '*Pass*.txt', 6);

  return entries.map((entry) => {
    const nearFound = entry.account ? searchPasswordsNearLogin(filePath, entry.account) : [];
    const merged = new Map();
    for (const item of baseFound) merged.set(`${item.file}:${item.line_no}`, item);
    for (const item of nearFound) {
      const key = `${item.file}:${item.line_no}`;
      if (!merged.has(key)) merged.set(key, item);
    }
    const account = String(entry.account || '').toLowerCase();
    for (const pair of txtPairs) {
      if (account && String(pair.login || '').toLowerCase() === account) {
        const loginKey = `${pair.file}:${pair.login_line}`;
        const passKey = `${pair.file}:${pair.password_line}`;
        if (!merged.has(loginKey)) {
          merged.set(loginKey, {
            file: pair.file,
            line_no: pair.login_line,
            type: 'login',
            key: 'login',
            value: pair.login,
            masked: maskValue(pair.login),
          });
        }
        if (!merged.has(passKey)) {
          merged.set(passKey, {
            file: pair.file,
            line_no: pair.password_line,
            type: 'password',
            key: 'password',
            value: pair.password,
            masked: maskValue(pair.password),
          });
        }
      }
    }
    const existing = Array.isArray(entry.related_passwords) ? entry.related_passwords : [];
    for (const item of existing) merged.set(`${item.file || ''}:${item.line_no || 0}:${item.value || ''}`, item);
    return {
      ...entry,
      related_passwords: Array.from(merged.values()),
      pass_file_credentials: creds.filter((item) => relevantCredential(item, entry)),
    };
  });
}

function formatResultDisplay(item) {
  const key = item.key || '';
  const value = item.value || '';
  return key ? `${key}: ${value}` : value;
}

module.exports = {
  searchRelatedPasswords,
  findPasswordsTxtInAncestors,
  findPasswordPairsInAncestors,
  findCredentialsInPassFiles,
  searchPasswordsNearLogin,
  attachPasswords,
  relevantCredential,
  formatResultDisplay,
  maskValue,
};
