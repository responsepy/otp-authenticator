const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { importFile, findScrapeFiles, findAuthenticatorLogs, isAuthenticatorLog, mainFolderName } = require('../src/importer');
const { createStore } = require('../src/store');
const { generateTOTP } = require('../src/totp');
const { findSiteLogins } = require('../src/passwordFinder');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otp-auth-'));
const filePath = path.join(dir, 'Auth', '000003.log');
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, JSON.stringify({
  dataType: 'OTPStorage',
  account: 'octocat',
  issuer: 'GitHub',
  secret: 'JBSWY3DPEHPK3PXP',
  type: 'totp',
}));

const entries = importFile(filePath, { prefs: { validate_otp: true }, profile: 'Work' });
assert.strictEqual(entries.length, 1);
assert.strictEqual(entries[0].issuer, 'GitHub');
assert.strictEqual(entries[0].account, 'octocat');
assert.strictEqual(entries[0].category, 'Coding/Development');
assert.strictEqual(entries[0].profile, 'Work');
assert.ok(generateTOTP(entries[0].secret).length >= 6);

const storePath = path.join(dir, 'state.json');
const store = createStore(storePath);
const added = store.addMany(entries);
assert.strictEqual(added.length, 1);
assert.strictEqual(store.addMany(entries).length, 0, 'duplicates should be skipped');
store.ensureProfile('Work');
assert.strictEqual(store.deleteProfile('Work'), true);
assert.strictEqual(store.list().length, 0, 'deleting a profile should remove its accounts');
store.addMany(entries);
store.ensureProfile('Work');
store.deleteAllProfiles();
assert.strictEqual(store.list().length, 0);
assert.deepStrictEqual(store.listProfiles(), []);

const scraped = findScrapeFiles(dir);
assert.ok(scraped.includes(filePath), 'expected Auth/*.log');

const dumpA = path.join(dir, 'ID[TELEGRAM @PIXELCLOUD2]2025_12_08T18_96_45_846447');
const dumpB = path.join(dir, 'DE[TELEGRAM @PIXELCLOUD2]2025_09_21T10_36_13_290854');
const withExtId = path.join(
  dumpA,
  'Plugins', 'Authenticator', 'Google Chrome', 'Default',
  'Sync Extension Settings', 'bhghoamapcdpbohphigoooaddinpkbai', '000003.log'
);
const withoutExtId = path.join(
  dumpB,
  'Plugins', 'Authenticator', 'Google Chrome', 'Profile 2',
  'Sync Extension Settings', '000003.log'
);
const ignored = path.join(dumpA, 'Wallets', 'Authenticator_Chrome_Default', '000003.log');
fs.mkdirSync(path.dirname(withExtId), { recursive: true });
fs.mkdirSync(path.dirname(withoutExtId), { recursive: true });
fs.mkdirSync(path.dirname(ignored), { recursive: true });
fs.writeFileSync(withExtId, JSON.stringify({ dataType: 'OTPStorage', account: 'a', issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', type: 'totp' }));
fs.writeFileSync(withoutExtId, JSON.stringify({ dataType: 'OTPStorage', account: 'b', issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', type: 'totp' }));
fs.writeFileSync(ignored, '{"secret":"nope"}');

const stray = path.join(dir, 'random-folder', '000003.log');
fs.mkdirSync(path.dirname(stray), { recursive: true });
fs.writeFileSync(stray, '{"secret":"nope"}');

assert.strictEqual(isAuthenticatorLog(withExtId), true);
assert.strictEqual(isAuthenticatorLog(withoutExtId), true);
assert.strictEqual(isAuthenticatorLog(ignored), true);
assert.strictEqual(isAuthenticatorLog(stray), false);
assert.strictEqual(mainFolderName(withExtId), 'ID[TELEGRAM @PIXELCLOUD2]2025_12_08T18_96_45_846447');
assert.strictEqual(mainFolderName(withoutExtId), 'DE[TELEGRAM @PIXELCLOUD2]2025_09_21T10_36_13_290854');
assert.strictEqual(mainFolderName(ignored), 'ID[TELEGRAM @PIXELCLOUD2]2025_12_08T18_96_45_846447');

const scrapedAfter = findScrapeFiles(dir);
assert.ok(scrapedAfter.includes(withExtId), 'scrape should find Authenticator 000003.log even if binary');
assert.ok(scrapedAfter.includes(ignored), 'scrape should find Authenticator_Chrome_* 000003.log');
assert.ok(!scrapedAfter.includes(stray), 'scrape should ignore 000003.log outside auth paths');

const cacheLog = path.join(dumpA, 'Cache', '000003.log');
fs.mkdirSync(path.dirname(cacheLog), { recursive: true });
fs.writeFileSync(cacheLog, '{"dataType":"OTPStorage","account":"x","issuer":"x","secret":"JBSWY3DPEHPK3PXP"}');
assert.ok(!findScrapeFiles(dir).includes(cacheLog), 'scrape should skip Chrome Cache folders');

const found = findAuthenticatorLogs(dir);
assert.strictEqual(found.length, 3);
assert.deepStrictEqual(found.map((item) => item.profile).sort(), [
  'DE[TELEGRAM @PIXELCLOUD2]2025_09_21T10_36_13_290854',
  'ID[TELEGRAM @PIXELCLOUD2]2025_12_08T18_96_45_846447',
  'ID[TELEGRAM @PIXELCLOUD2]2025_12_08T18_96_45_846447',
]);

const dumpRoot = path.join(dir, 'ID[TELEGRAM @PIXELCLOUD2]2025_12_08T18_96_45_846447');
const passwordsFile = path.join(dumpRoot, 'passwords.txt');
fs.writeFileSync(passwordsFile, [
  'URL: https://github.com/login',
  'USER: octocat',
  'PASS: hunter2',
  '',
  'URL: https://discord.com/login',
  'USER: other',
  'PASS: secret',
].join('\n'));
const siteLogins = findSiteLogins(withExtId, { issuer: 'GitHub', account: 'octocat' });
assert.ok(siteLogins.files.includes(passwordsFile));
assert.strictEqual(siteLogins.pairs.length, 1);
assert.strictEqual(siteLogins.pairs[0].user, 'octocat');
assert.strictEqual(siteLogins.pairs[0].password, 'hunter2');

console.log('importer tests passed');
