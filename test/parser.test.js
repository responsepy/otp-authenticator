const assert = require('assert');
const { extractAllJsonObjectsFromBytes, normalizeEntry } = require('../src/parser');
const { categorizeEntry } = require('../src/categorizer');
const { prettyAccountName } = require('./helpers');

const sample = Buffer.from('garbage... {"mp_some_mixpanel":"{\\"distinct_id\\": \\"abc\\", \\"$device_id\\": \\"xyz\\"}", "other":1}\n');
const objects = extractAllJsonObjectsFromBytes(sample);
assert.ok(objects.length >= 1, 'expected a top-level object');
assert.ok(objects.some((item) => 'distinct_id' in item || '$device_id' in item), 'expected nested dict');

const normalized = normalizeEntry({ type: 1, secret: 'jbsw y3dp ehpk 3pxp', account: 'a', issuer: 'GitHub' });
assert.strictEqual(normalized.type, 'totp');
assert.strictEqual(normalized.secret, 'JBSWY3DPEHPK3PXP');
assert.strictEqual(categorizeEntry(normalized), 'Coding/Development');

assert.strictEqual(prettyAccountName('lastpass-logo_url'), 'Lastpass');
assert.strictEqual(prettyAccountName('liberty_bank-logo_url'), 'Liberty Bank');
assert.strictEqual(prettyAccountName(''), '');

console.log('parser tests passed');
