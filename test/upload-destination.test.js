const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedUploadDestination } = require('../dist/nodes/MossAi/upload-destination');

const ticket = '12345678-1234-1234-1234-123456789abc';

test('accepts only the exact global ticket upload target', () => {
  assert.equal(isTrustedUploadDestination('https://www.550wai.cn/mcp-media/global/image', 'image', ticket), true);
  for (const target of [
    'http://www.550wai.cn/mcp-media/global/image',
    'https://www.550wai.cn.evil.example/mcp-media/global/image',
    'https://www.550wai.cn/mcp-media/cn/image',
    'https://www.550wai.cn/mcp-media/global/video',
    'https://user:password@www.550wai.cn/mcp-media/global/image',
    'https://www.550wai.cn/mcp-media/global/image?next=evil',
    'https://www.550wai.cn/mcp-media/global/image#fragment',
    'not-a-url',
  ]) assert.equal(isTrustedUploadDestination(target, 'image', ticket), false, target);
  assert.equal(isTrustedUploadDestination('https://www.550wai.cn/mcp-media/global/image', 'image', 'invalid'), false);
});
