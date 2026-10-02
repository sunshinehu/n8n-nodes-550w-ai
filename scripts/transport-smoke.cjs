// Development-only transport check. Not shipped as node runtime code.
// Run: node scripts/transport-smoke.cjs /absolute/path/to/n8n/node_modules
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');
if (!process.argv[2]) throw new Error('Provide the node_modules directory of an installed n8n runtime.');
const { httpRequest } = require(path.join(path.resolve(process.argv[2]), '@n8n/backend-network/dist/http/axios/request.js'));
const { FiftyW } = require('../dist/nodes/FiftyW/FiftyW.node');
(async () => {
  const observed = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    observed.push({ headers: req.headers, bytes: Buffer.concat(chunks) });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ code: 200, status: 'preparing' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const filesystem of [false, true]) {
      const params = { operation: filesystem ? 'videoErase' : 'imageWatermark',
        operationId: 'transport-smoke-' + (filesystem ? 'video' : 'image'),
        confirmCharge: true, binaryField: 'data', eraseRegion: 'full' };
      const ctx = {
        getInputData: () => [{ json: {} }],
        getNode: () => ({ name: '550W', type: 'fiftyW', typeVersion: 2 }),
        getNodeParameter: (name, _i, fallback) => params[name] ?? fallback,
        continueOnFail: () => false,
        helpers: {
          assertBinaryData: () => filesystem
            ? { id: 'test-provider', fileName: 'clip.mov', mimeType: 'video/quicktime' }
            : { data: 'aW1hZ2U=', fileName: 'image.png', mimeType: 'image/png' },
          getBinaryDataBuffer: async () => Buffer.from('image'),
          getBinaryMetadata: async () => ({ fileSize: 5 }),
          getBinaryStream: async () => Readable.from([Buffer.from('video')]),
          httpRequestWithAuthentication: async (_auth, req) => {
            assert.ok(req.url.endsWith('/upload-ticket'));
            return { code: 200, ticket: '12345678-1234-1234-1234-123456789abc'.repeat(2) };
          },
          httpRequest: async req => {
            // Redirect only inside this local test harness; production node stays fixed-origin.
            assert.equal(req.url, 'https://www.550wai.cn/media-api/global/v1/media');
            return httpRequest({ ...req, url: 'http://127.0.0.1:' + server.address().port });
          },
        },
      };
      const result = (await new FiftyW().execute.call(ctx))[0][0].json;
      assert.equal(result.status, 'preparing');
      const request = observed.at(-1);
      assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);
      assert.equal(request.headers.authorization, undefined);
      assert.equal(request.headers['x-550w-upload-ticket'].length, 72);
      assert.match(request.bytes.toString(), /name="operationId"/);
      assert.ok(request.bytes.toString().includes(params.operationId));
      assert.ok(request.bytes.toString().includes(filesystem ? 'video.mov' : 'image.png'));
      if (filesystem) assert.equal(Number(request.headers['content-length']), request.bytes.length);
      console.log('PASS real n8n transport: ' + (filesystem ? 'filesystem stream' : 'inline FormData'));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
