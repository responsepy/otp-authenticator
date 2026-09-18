function parseOtpAuth(uri) {
  const raw = String(uri || '').trim();
  if (!raw.toLowerCase().startsWith('otpauth://')) {
    throw new Error('Paste an otpauth:// URI');
  }

  const parsed = new URL(raw);
  const type = parsed.hostname.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') {
    throw new Error('Only TOTP and HOTP accounts are supported');
  }

  const label = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  let issuer = parsed.searchParams.get('issuer') || '';
  let account = label;
  const split = label.indexOf(':');
  if (split !== -1) {
    const labelIssuer = label.slice(0, split).trim();
    account = label.slice(split + 1).trim();
    issuer = issuer || labelIssuer;
  }

  const secret = (parsed.searchParams.get('secret') || '').replace(/[\s-]+/g, '');
  if (!secret) throw new Error('URI is missing a secret');

  return {
    issuer: issuer.trim(),
    account: account.trim(),
    secret,
    type,
    digits: Number(parsed.searchParams.get('digits') || 6),
    period: Number(parsed.searchParams.get('period') || 30),
    algorithm: (parsed.searchParams.get('algorithm') || 'SHA1').toUpperCase(),
    index: Number(parsed.searchParams.get('counter') || 0),
  };
}

function toOtpAuth(account) {
  const type = String(account.type || 'totp').toLowerCase() === 'hotp' ? 'hotp' : 'totp';
  const label = account.issuer
    ? `${encodeURIComponent(account.issuer)}:${encodeURIComponent(account.account || '')}`
    : encodeURIComponent(account.account || 'Account');
  const params = new URLSearchParams({
    secret: account.secret,
    issuer: account.issuer || '',
    digits: String(account.digits || 6),
    algorithm: account.algorithm || 'SHA1',
  });
  if (type === 'totp') params.set('period', String(account.period || 30));
  if (type === 'hotp') params.set('counter', String(account.index || 0));
  return `otpauth://${type}/${label}?${params.toString()}`;
}

function maybeParseSecret(value) {
  if (typeof value === 'string' && value.toLowerCase().startsWith('otpauth://')) {
    try {
      return parseOtpAuth(value);
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = { parseOtpAuth, toOtpAuth, maybeParseSecret };
