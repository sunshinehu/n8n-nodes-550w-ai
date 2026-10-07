// Offline host-specific regression: execute n8n's installed initializer and
// Connect handler with its real credential DTO. No browser, credentials, DB or
// network access; never patch the host or relax the backend name validation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function main() {
  const modules = path.resolve(process.argv[2] || '');
  assert.ok(process.argv[2], 'Pass the acceptance n8n node_modules directory');
  const hostRequire = createRequire(path.join(modules, '..', 'package.json'));
  const host = hostRequire('n8n/package.json');
  assert.equal(host.version, '2.41.5', 'This source extraction is pinned to the reproduced host');
  const { CreateCredentialDto } = hostRequire('@n8n/api-types');
  const assets = path.join(modules, 'n8n-editor-ui', 'dist', 'assets');
  function asset(prefix) {
    const files = fs.readdirSync(assets).filter(p => p.startsWith(prefix) && p.endsWith('.js'));
    assert.equal(files.length, 1, `Expected one ${prefix} asset`);
    return fs.readFileSync(path.join(assets, files[0]), 'utf8');
  }
  function between(source, start, end) {
    const offset = source.indexOf(start);
    assert.notEqual(offset, -1, `Missing host code: ${start}`);
    const limit = source.indexOf(end, offset + start.length);
    assert.notEqual(limit, -1, `Missing host code: ${end}`);
    return source.slice(offset, limit);
  }
  const form = asset('useCredentialForm-');
  const initializer = between(form, 'async function Ae(){', 'function je(');
  const editor = asset('index-');
  const modal = editor.slice(editor.indexOf('credentialData:ve,credentialName:ye'));
  const connect = between(modal, 'async function Nt(){', 'async function Pt(');
  const save = between(modal, 'async function Dt(){', 'async function Ot(');
  const payload = save.match(/let r=(\{id:be\.value,name:ye\.value,type:Ne\.value,data:e,isGlobal:le\.value,isResolvable:Y\.value\});/);
  assert.ok(payload, 'Host credential payload must still use the current name ref');
  const type = 'mossAiOAuth2Api';

  function setup() {
    let resolveName;
    const name = { value: '' };
    const initialization = vm.createContext({
      e: { mode: 'new' }, f: value => value,
      N: { value: type }, P: { value: { displayName: '550W Media OAuth2 API' } },
      p: name, d: { value: {} }, j: { value: undefined }, $: () => {},
      t: { getNewCredentialName: () => new Promise(resolve => { resolveName = resolve; }) },
    });
    const pending = vm.runInContext(`${initializer}; Ae()`, initialization);
    const calls = { saved: 0, authorized: 0, popupClosed: 0, errors: [] };
    const credentials = { value: '' };
    const context = vm.createContext({
      AbortController, URL, e: {},
      ye: name, be: credentials, Ne: { value: type },
      le: { value: false }, Y: { value: false },
      We: { value: { create: true } }, Fe: { value: ['oAuth2Api'] },
      ve: { value: {} }, G: { value: 'offline-workflow' },
      He: { value: true }, me: { value: {} }, de: { value: null },
      M: { urlBaseEditor: 'https://example.invalid' },
      t: { mode: 'new' },
      window: { open: () => ({ close: () => calls.popupClosed++, location: {} }) },
      g: { showError: error => calls.errors.push(error) },
      v: { baseText: text => text }, k: { track: () => {} },
      Ot: () => {}, jn: () => true, Ru: () => false, zu: () => [],
      Iu: async () => 'aborted',
      i: { oAuth2Authorize: async () => { calls.authorized++; return 'https://example.invalid/authorize'; } },
    });
    async function saveCredential() {
      try {
        const draft = vm.runInContext(`(${payload[1]})`, context);
        CreateCredentialDto.parse(draft);
        calls.saved++;
        credentials.value = 'offline-credential';
        return { id: credentials.value, isResolvable: false };
      } catch (error) {
        calls.errors.push(error);
        return null;
      }
    }
    context.Dt = saveCredential;
    return {
      calls, name,
      initialize: async () => { resolveName('550W Media account'); await pending; },
      save: saveCredential,
      connect: () => vm.runInContext(`${connect}; Nt()`, context),
    };
  }

  const immediate = setup();
  await immediate.connect();
  assert.equal(immediate.name.value, '');
  assert.equal(immediate.calls.saved, 0);
  assert.equal(immediate.calls.authorized, 0);
  assert.equal(immediate.calls.popupClosed, 1);
  assert.deepEqual(immediate.calls.errors[0].issues.map(issue => issue.path), [['name']]);
  assert.match(immediate.calls.errors[0].issues[0].message, /at least 1 character/);
  await immediate.initialize();

  const initialized = setup();
  await initialized.initialize();
  await initialized.connect();
  assert.equal(initialized.calls.errors.length, 0);
  assert.equal(initialized.calls.authorized, 1);

  const saved = setup();
  await saved.initialize();
  assert.ok(await saved.save());
  await saved.connect();
  assert.equal(saved.calls.errors.length, 0);
  assert.equal(saved.calls.authorized, 1);

  console.log(JSON.stringify({ host: host.version, cases: 3, passed: true,
    earlyConnect: 'Rejected empty name before any OAuth request',
    initializedConnect: 'Accepted', saveThenConnect: 'Accepted',
    network: 'Mocked; no live authorization or task submission' }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
