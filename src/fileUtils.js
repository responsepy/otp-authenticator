const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

function getDirectoryForPath(target) {
  if (!target) return null;
  const absolute = path.resolve(target);
  if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) return absolute;
  const directory = path.dirname(absolute);
  return fs.existsSync(directory) ? directory : null;
}

function getParentDirectoryForPath(target) {
  if (!target) return null;
  let current = path.resolve(target);
  if (!(fs.existsSync(current) && fs.statSync(current).isDirectory())) {
    current = path.dirname(current);
  }
  const parent = path.dirname(current);
  return parent && fs.existsSync(parent) ? parent : null;
}

async function openDirectory(target) {
  const directory = getDirectoryForPath(target);
  if (!directory) return false;
  const error = await shell.openPath(directory);
  return !error;
}

function shortSourceLabel(sourcePath) {
  if (!sourcePath) return { label: '', ancestor: false };
  const directory = getParentDirectoryForPath(sourcePath) || getDirectoryForPath(sourcePath) || sourcePath;
  const parts = path.normalize(directory).split(path.sep).filter(Boolean);
  const exclude = new Set(['sync extension settings', 'sync', 'settings', 'profiles', 'extensions']);

  for (let i = 1; i <= Math.min(parts.length, 7); i += 1) {
    const candidate = parts[parts.length - i];
    if (!candidate || exclude.has(candidate.toLowerCase())) continue;
    if (
      /\[.*\]/.test(candidate) ||
      /\d{4}[-_]\d{2}[-_]\d{2}T/.test(candidate) ||
      ((candidate.includes('[') || candidate.includes(']')) && /20\d{2}/.test(candidate)) ||
      /^[A-Za-z]{1,3}\[.+\].*20\d{2}/.test(candidate)
    ) {
      return { label: candidate, ancestor: true };
    }
  }

  return { label: path.basename(path.normalize(directory)) || directory, ancestor: false };
}

function informativeAncestorDirectory(sourcePath) {
  if (!sourcePath) return null;
  const directory = getDirectoryForPath(sourcePath) || sourcePath;
  const parts = path.normalize(directory).split(path.sep);
  const maxScan = Math.min(parts.length, 10);

  for (let i = 1; i <= maxScan; i += 1) {
    const candidate = parts[parts.length - i];
    if (!candidate) continue;
    const informative =
      /\[.*\]/.test(candidate) ||
      /\d{4}[-_]\d{2}[-_]\d{2}/.test(candidate) ||
      /\d{2}[-_]\d{2}[-_]\d{2}/.test(candidate) ||
      /\d{1,3}(?:\.\d{1,3}){3}/.test(candidate) ||
      ((candidate.includes('_') || candidate.includes('-')) && /\d/.test(candidate) && candidate.length > 6);
    if (informative) {
      return parts.slice(0, parts.length - i + 1).join(path.sep) || path.sep;
    }
  }
  return getParentDirectoryForPath(sourcePath) || getDirectoryForPath(sourcePath);
}

module.exports = {
  getDirectoryForPath,
  getParentDirectoryForPath,
  openDirectory,
  shortSourceLabel,
  informativeAncestorDirectory,
};
