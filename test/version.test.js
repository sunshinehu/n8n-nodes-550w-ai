const test = require('node:test');
const assert = require('node:assert/strict');
test('shipped attribution version matches native manifest', () => { assert.equal(require('../dist/shared/version').PACKAGE_VERSION, require('../package.json').version); });
