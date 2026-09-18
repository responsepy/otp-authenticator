const assert = require('assert');
const { generateTOTP, generateHOTP, remainingSeconds, isValidSecret } = require('../src/totp');
const { parseOtpAuth, toOtpAuth } = require('../src/uri');

// RFC 6238 SHA1 test vector: secret "12345678901234567890" as base32 is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
assert.strictEqual(generateTOTP(secret, { timestamp: 1111111109 * 1000, digits: 8 }), '07081804');
assert.strictEqual(generateHOTP(secret, 0, { digits: 6 }), '755224');
assert.ok(remainingSeconds(30) > 0);
assert.ok(isValidSecret(secret));
assert.ok(!isValidSecret('!!!'));

const parsed = parseOtpAuth('otpauth://totp/GitHub:you@mail.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub');
assert.strictEqual(parsed.issuer, 'GitHub');
assert.strictEqual(parsed.account, 'you@mail.com');
assert.strictEqual(parsed.secret, 'JBSWY3DPEHPK3PXP');
assert.ok(toOtpAuth(parsed).startsWith('otpauth://totp/'));

console.log('totp tests passed');
