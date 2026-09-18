const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const cleaned = String(input || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[\s-]+/g, '');
  if (!cleaned) throw new Error('Secret is empty');

  let bits = '';
  for (const char of cleaned) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) throw new Error('Invalid base32 secret');
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  if (!bytes.length) throw new Error('Invalid base32 secret');
  return Buffer.from(bytes);
}

function hmacAlgorithm(name) {
  const normalized = String(name || 'SHA1').toUpperCase().replace(/-/g, '');
  if (normalized === 'SHA1') return 'sha1';
  if (normalized === 'SHA256') return 'sha256';
  if (normalized === 'SHA512') return 'sha512';
  throw new Error(`Unsupported algorithm: ${name}`);
}

function hotpFromCounter(secret, counter, options = {}) {
  const digits = Number(options.digits || 6);
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(hmacAlgorithm(options.algorithm), key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

function generateTOTP(secret, options = {}) {
  const period = Number(options.period || 30);
  const timestamp = options.timestamp ?? Date.now();
  const counter = Math.floor(timestamp / 1000 / period);
  return hotpFromCounter(secret, counter, options);
}

function generateHOTP(secret, counter = 0, options = {}) {
  return hotpFromCounter(secret, Number(counter || 0), options);
}

function remainingSeconds(period = 30, timestamp = Date.now()) {
  const p = Number(period || 30);
  return p - (Math.floor(timestamp / 1000) % p);
}

function isValidSecret(secret, options = {}) {
  try {
    if (String(options.type || 'totp').toLowerCase() === 'hotp') {
      generateHOTP(secret, options.index || 0, options);
    } else {
      generateTOTP(secret, options);
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  generateTOTP,
  generateHOTP,
  remainingSeconds,
  base32Decode,
  isValidSecret,
};
