const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMcpResponse, eraseRectangle } = require('../dist/nodes/FiftyW/mcp-response');
test('MCP JSON and SSE return the same result', () => {
  const value = { jsonrpc: '2.0', id: 1, result: { structuredContent: { credits: 5 } } };
  assert.deepEqual(parseMcpResponse(value), value);
  assert.deepEqual(parseMcpResponse(JSON.stringify(value)), value);
  assert.deepEqual(parseMcpResponse(`: keepalive\r\n\r\nevent: message\r\ndata: ${JSON.stringify(value)}\r\n\r\n`), value);
});
test('MCP rejects malformed or ambiguous replies', () => {
  for (const value of [{}, '{}', '[]', '', 'data: invalid\n\n', 'data: {"result":{}}\n\ndata: {"result":{}}\n\n'])
    assert.throws(() => parseMcpResponse(value));
});
test('rectangle defaults to full frame and requires explicit valid coordinates', () => {
  assert.deepEqual(eraseRectangle([], 100, 100), {});
  assert.deepEqual(eraseRectangle([0, 0, 90, 90], 100, 100), { x1: 0, y1: 0, x2: 90, y2: 90 });
  for (const value of [[0, 0, 101, 90], [0, null, 90, 90], [0.5, 0, 90, 90], [90, 0, 0, 90]])
    assert.throws(() => eraseRectangle(value, 100, 100));
});
