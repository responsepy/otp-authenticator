const KNOWN_SITES = {
  github: 'https://github.com/login',
  gitlab: 'https://gitlab.com/users/sign_in',
  bitbucket: 'https://bitbucket.org/account/signin',
  google: 'https://accounts.google.com',
  gmail: 'https://mail.google.com',
  discord: 'https://discord.com/login',
  telegram: 'https://web.telegram.org',
  yahoo: 'https://login.yahoo.com',
  outlook: 'https://outlook.office.com',
  hotmail: 'https://login.live.com',
  facebook: 'https://www.facebook.com/login',
  paypal: 'https://www.paypal.com/signin',
  coinbase: 'https://www.coinbase.com/signin',
  binance: 'https://www.binance.com/en/login',
  metamask: 'https://wallet.metamask.io/',
  steam: 'https://store.steampowered.com/login/',
};

function extractDomainFromEmail(email) {
  if (!email) return null;
  const match = String(email).match(/@([A-Za-z0-9.-]+)$/);
  return match ? match[1].toLowerCase() : null;
}

function guessSiteForEntry(entry) {
  if (!entry) return null;
  const issuer = String(entry.issuer || '').toLowerCase();
  const account = String(entry.account || '').toLowerCase();
  const category = String(entry.category || '').toLowerCase();

  for (const [keyword, url] of Object.entries(KNOWN_SITES)) {
    if (issuer.includes(keyword) || account.includes(keyword) || category.includes(keyword)) {
      return url;
    }
  }

  const raw = entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
  let url = raw.menuItemUrl || raw.menu_item_url || raw.logo_url || null;
  if (url) return String(url).replace(/^filesystem:/, '');

  const domain = extractDomainFromEmail(account);
  if (domain) return `https://${domain}`;

  const accountDomain = account.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (accountDomain) return `https://${accountDomain[1]}`;

  const issuerDomain = issuer.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (issuerDomain) return `https://${issuerDomain[1]}`;

  return null;
}

function normalizeUrl(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, '')}`;
}

module.exports = { KNOWN_SITES, guessSiteForEntry, normalizeUrl };
