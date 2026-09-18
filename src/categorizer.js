const CATEGORY_KEYWORDS = {
  'Email Access': ['gmail', 'google', 'yahoo', 'outlook', 'hotmail', 'email', 'mail'],
  'Crypto Currency': ['wallet', 'wallets', 'metamask', 'coinbase', 'binance', 'crypto', 'ethereum', 'eth', 'btc', 'bitcoin'],
  'Coding/Development': ['github', 'gitlab', 'bitbucket', 'stack overflow', 'stackoverflow', 'git', 'npm', 'python', 'pip', 'docker'],
  Financial: ['bank', 'banking', 'paypal', 'stripe', 'visa', 'mastercard', 'finance', 'investment', 'broker'],
  Messaging: ['telegram', 'slack', 'discord', 'signal', 'whatsapp', 'messaging', 'discordapp'],
  Social: ['facebook', 'instagram', 'twitter', 'x.com', 'tiktok', 'linkedin', 'social'],
  Entertainment: ['netflix', 'spotify', 'youtube', 'hulu', 'twitch', 'steam', 'games', 'roblox', 'epic games', 'epic'],
  'Hardware/Video Games': ['nvidia', 'steam', 'epic', 'xbox', 'playstation'],
  Security: ['authenticator', 'otp', 'totp', 'two-factor', '2fa', 'auth'],
  Other: [],
};

const ISSUER_MAP = {
  google: 'Email Access',
  gmail: 'Email Access',
  discord: 'Messaging',
  'epic games': 'Entertainment',
  epic: 'Entertainment',
  roblox: 'Entertainment',
  binance: 'Crypto Currency',
  coinbase: 'Crypto Currency',
  metamask: 'Crypto Currency',
  nvidia: 'Hardware/Video Games',
  facebook: 'Social',
  kycport: 'Security',
  sss: 'Security',
};

const CATEGORY_COLORS = {
  'Email Access': '#2b7cff',
  'Crypto Currency': '#f39c12',
  'Coding/Development': '#27ae60',
  Financial: '#9b59b6',
  Messaging: '#16a085',
  Social: '#e74c3c',
  Entertainment: '#8e44ad',
  Other: '#95a5a6',
  Security: '#34495e',
  'Hardware/Video Games': '#d35400',
};

function extractDomain(text) {
  if (!text) return null;
  const match = String(text).match(/([\w-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
  return match ? match[1].toLowerCase() : null;
}

function categorizeEntry(entry, sourcePath) {
  if (!entry) return 'Other';

  const issuer = String(entry.issuer || '').trim();
  const account = String(entry.account || '').trim();
  const hay = [issuer, account, sourcePath || ''].filter(Boolean).join(' ').toLowerCase();

  if (issuer) {
    const lower = issuer.toLowerCase();
    for (const [key, category] of Object.entries(ISSUER_MAP)) {
      if (lower.includes(key)) return category;
    }
  }

  const domain = extractDomain(hay);
  if (domain) {
    if (domain.includes('binance') || domain.includes('coin') || domain.includes('wallet')) return 'Crypto Currency';
    if (domain.includes('discord') || hay.includes('slack')) return 'Messaging';
    if (domain.includes('facebook') || domain.includes('instagram') || domain.includes('linkedin')) return 'Social';
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword && hay.includes(keyword)) return category;
    }
  }
  return 'Other';
}

function countCategories(entries, profile) {
  const counts = {};
  for (const entry of entries) {
    if (profile && entry.profile !== profile) continue;
    const category = entry.category || 'Other';
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

module.exports = {
  CATEGORY_KEYWORDS,
  ISSUER_MAP,
  CATEGORY_COLORS,
  categorizeEntry,
  countCategories,
};
