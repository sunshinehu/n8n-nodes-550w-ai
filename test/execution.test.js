const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { MossAi, ENDPOINT, parseResponse, selectedArea } = require('../dist/shared/legacy-node');
const { MossAiOAuth2Api } = require('../dist/shared/legacy-credential');
function context(params, helpers = {}, type = 'mossAi', continueOnFail = false) {
  const authenticated = helpers.httpRequestWithAuthentication;
  if (authenticated) {
    helpers.httpRequestWithAuthentication = async (auth, req) => {
      if (req.url.endsWith('/upload-ticket')) {
        assert.equal(auth, 'mossAiOAuth2Api');
        return { code: 200, ticket: '12345678-1234-1234-1234-123456789abc'.repeat(2) };
      }
      return authenticated(auth, req);
    };
    helpers.httpRequest = async req => {
      assert.equal(req.headers.Authorization, undefined);
      assert.equal(req.headers['X-550W-Upload-Ticket'].length, 72);
      return authenticated(undefined, req);
    };
  }
  return { getInputData: () => [{ json: {} }],
    getNodeParameter: (name, _i, fallback) => params[name] ?? fallback,
    getNode: () => ({ name: '550W', type }), continueOnFail: () => continueOnFail, helpers };
}
const paid = { operationId: 'stable-operation-1', confirmCharge: true };
test('old node version cannot silently submit paid REST tasks', async () => {
  const ctx = context({ ...paid, operation: 'imageWatermark' });
  ctx.getNode = () => ({ name: '550W', type: 'mossAi', typeVersion: 1 });
  await assert.rejects(new MossAi().execute.call(ctx), /Upgrade this node to version 2/);
});
test('credential connection test is read-only', () => {
  assert.equal(new MossAiOAuth2Api().test.request.method, 'GET');
  assert.equal(new MossAiOAuth2Api().test.request.url, '/account');
});
test('credential notice explains safe native Save then Connect without changing auth identity', () => {
  const credential = new MossAiOAuth2Api();
  const notice = credential.properties.find(p => p.name === 'connectionNotice');
  assert.match(notice.displayName, /credential name appears, click Save, then Connect/);
  assert.equal(credential.name, 'mossAiOAuth2Api');
  assert.deepEqual(credential.extends, ['oAuth2Api']);
});
test('credits use native REST and fixed authenticated origin', async () => {
  const ctx = context({ operation: 'credits' }, { httpRequestWithAuthentication: async (auth, req) => {
    assert.equal(auth, 'mossAiOAuth2Api'); assert.equal(req.method, 'GET');
    assert.equal(req.url, ENDPOINT + '/account'); assert.equal(req.body, undefined);
    assert.equal(req.disableFollowRedirect, true);
    return { code: 200, credits: 20 };
  } });
  assert.equal((await new MossAi().execute.call(ctx))[0][0].json.credits, 20);
});
test('AI tools reject paid calls before file or network access', async () => {
  await assert.rejects(new MossAi().execute.call(context({ operation: 'videoErase' }, {}, 'mossAiTool')), /read-only/);
});
test('paid submission requires explicit approval', async () => {
  await assert.rejects(new MossAi().execute.call(context({ ...paid, operation: 'videoWatermark', confirmCharge: false })), /Approve/);
});
test('legacy upload never silently becomes a paid task', async () => {
  for (const operation of ['videoUpload', 'subtitleMedia'])
    await assert.rejects(new MossAi().execute.call(context({ operation })), /must migrate/);
});
test('oversized filesystem binary is rejected before reading', async () => {
  const ctx = context({ ...paid, operation: 'videoErase', binaryField: 'data' }, {
    assertBinaryData: () => ({ id: 'filesystem:asset', fileName: 'video.mp4' }),
    getBinaryMetadata: async () => ({ fileSize: 201 * 1024 * 1024 }),
    getBinaryStream: async () => { throw new Error('must not read'); },
  });
  await assert.rejects(new MossAi().execute.call(ctx), /size limit/);
});
test('structured REST failure is not a successful task', async () => {
  const ctx = context({ operation: 'subtitleTask', taskId: 'existing' }, {
    httpRequestWithAuthentication: async () => ({ code: 404, errorCode: 'TASK_NOT_FOUND' }),
  });
  await assert.rejects(new MossAi().execute.call(ctx), /TASK_NOT_FOUND/);
});
for (const fail of [false, true]) test('filesystem upload closes streams on ' + (fail ? 'failure' : 'success'), async () => {
  const stream = Readable.from([Buffer.from('video')]);
  const ctx = context({ ...paid, operation: 'videoErase', binaryField: 'data' }, {
    assertBinaryData: () => ({ id: 'filesystem:asset', fileName: 'video.mov', mimeType: 'video/quicktime' }),
    getBinaryMetadata: async () => ({ fileSize: 5 }), getBinaryStream: async () => stream,
    getBinaryDataBuffer: async () => { throw new Error('must not buffer filesystem media'); },
    httpRequestWithAuthentication: async (auth, req) => {
      assert.equal(auth, undefined); assert.equal(req.url, ENDPOINT + '/media');
      assert.equal(req.disableFollowRedirect, true);
      if (fail) throw new Error('upload failed');
      const chunks = []; for await (const c of req.body) chunks.push(Buffer.from(c));
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.length, req.headers['Content-Length']);
      assert.match(bytes.toString(), /filename="video.mov"/);
      assert.match(bytes.toString(), /name="mediaType"\r\n\r\nvideo/);
      assert.match(bytes.toString(), /stable-operation-1/);
      return JSON.stringify({ code: 200, status: 'preparing', operationId: paid.operationId });
    },
  });
  if (fail) await assert.rejects(new MossAi().execute.call(ctx), /Query operation receipt stable-operation-1/);
  else assert.equal((await new MossAi().execute.call(ctx))[0][0].json.status, 'preparing');
  assert.equal(stream.destroyed, true);
});
test('inline image uploads with multipart fields and explicit approval', async () => {
  const ctx = context({ ...paid, operation: 'imageWatermark', binaryField: 'data' }, {
    assertBinaryData: () => ({ data: 'cG5n', fileName: 'input.png', mimeType: 'image/png' }),
    getBinaryDataBuffer: async () => Buffer.from('png'),
    httpRequestWithAuthentication: async (_auth, req) => {
      assert.equal(req.body.get('mediaType'), 'image');
      assert.equal(req.body.get('operationId'), paid.operationId);
      assert.equal(req.body.get('file').size, 3);
      return { code: 200, status: 'preparing' };
    },
  });
  assert.equal((await new MossAi().execute.call(ctx))[0][0].json.status, 'preparing');
});
test('direct URL defaults to full frame without fake dimensions', async () => {
  const ctx = context({ ...paid, operation: 'subtitleUrl', subtitleVideoUrl: 'https://example.com/video.mp4' }, {
    httpRequestWithAuthentication: async (_auth, req) => {
      assert.deepEqual(req.body, { operationId: paid.operationId, mediaType: 'video', sourceUrl: 'https://example.com/video.mp4' });
      return { code: 200, status: 'preparing' };
    },
  });
  await new MossAi().execute.call(ctx);
});
test('explicit rectangle is forwarded and malformed rectangles rejected', async () => {
  assert.deepEqual(selectedArea([1, 2, 10, 20]), [1, 2, 10, 20]);
  for (const area of [[-1, 0, 3, 4], [2, 0, 1, 4], [0, 0, 1.2, 4], [0, 0, 100000, 4]])
    assert.throws(() => selectedArea(area), /rectangle/);
});
test('timeout exposes recovery ID and never resubmits', async () => {
  let calls = 0;
  const ctx = context({ ...paid, operation: 'videoWatermark', videoUrl: 'https://www.tiktok.com/@test/video/123' }, {
    httpRequestWithAuthentication: async () => { calls++; throw new Error('timeout'); },
  }, 'mossAi', true);
  const result = (await new MossAi().execute.call(ctx))[0][0].json;
  assert.equal(calls, 1); assert.equal(result.operationId, paid.operationId);
  assert.equal(result.submissionStatus, 'unknown');
});
test('receipt action is read-only and preserves resolved download URL', async () => {
  const resolved = 'https://cdn.example.com/result.mp4';
  const ctx = context({ operation: 'receipt', operationId: paid.operationId }, {
    httpRequestWithAuthentication: async (_auth, req) => {
      assert.equal(req.method, 'GET'); assert.equal(req.url, ENDPOINT + '/operations/' + paid.operationId);
      return { code: 200, status: 'completed', videoUrl: resolved };
    },
  }, 'mossAiTool');
  assert.equal((await new MossAi().execute.call(ctx))[0][0].json.videoUrl, resolved);
});
test('malformed responses and path injection are rejected', async () => {
  for (const value of [null, [], { credits: 2 }, '{']) assert.throws(() => parseResponse(value));
  await assert.rejects(new MossAi().execute.call(context({ operation: 'subtitleTask', taskId: '../account' })), /Invalid task/);
});
test('credential uses dynamic OAuth, mandatory PKCE and media audience', () => {
  const fields = Object.fromEntries(new MossAiOAuth2Api().properties.map(p => [p.name, p.default]));
  assert.equal(fields.useDynamicClientRegistration, true); assert.equal(fields.usePkce, true);
  assert.equal(fields.serverUrl, 'https://www.550wai.cn/media-api/global');
  assert.equal(fields.resource, 'https://www.550wai.cn/media-api/global');
  assert.equal(fields.authentication, 'body'); assert.ok(!fields.scope.includes('tasks:delete'));
});
