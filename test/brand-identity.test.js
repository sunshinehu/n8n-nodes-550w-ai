const test = require('node:test');
const assert = require('node:assert/strict');
const { FiftyW } = require('../dist/nodes/FiftyW/FiftyW.node');
const { MossAi } = require('../dist/shared/legacy-node');
const { FiftyWOAuth2Api } = require('../dist/credentials/FiftyWOAuth2Api.credentials');
const { MossAiOAuth2Api } = require('../dist/shared/legacy-credential');
test('brand and legacy registrations retain separate stable credential identities', () => {
 assert.equal(new FiftyW().description.name,'fiftyW');
 assert.equal(new FiftyW().description.credentials[0].name,'fiftyWOAuth2Api');
 assert.equal(new MossAi().description.name,'mossAi');
 assert.equal(new MossAi().description.credentials[0].name,'mossAiOAuth2Api');
 assert.equal(new FiftyWOAuth2Api().name,'fiftyWOAuth2Api');
 assert.equal(new MossAiOAuth2Api().name,'mossAiOAuth2Api');
});
for(const [Ctor,type,credential] of [[FiftyW,'n8n-nodes-fiftyw-media.fiftyW','fiftyWOAuth2Api'],[MossAi,'n8n-nodes-moss-ai.mossAi','mossAiOAuth2Api']]) {
 test(`${type} executes read-only query with its own credential`,async()=>{
  const calls=[];
  const ctx={getInputData:()=>[{json:{}}],getNode:()=>({type}),getNodeParameter:(name)=>({resource:'account',operation:'credits'}[name]),
   helpers:{httpRequestWithAuthentication:async(auth,req)=>{calls.push({auth,req});return {code:200,credits:100};},constructExecutionMetaData:(x)=>x},continueOnFail:()=>false};
  await new Ctor().execute.call(ctx);
  assert.equal(calls.length,1); assert.equal(calls[0].auth,credential);assert.equal(calls[0].req.method,'GET');
 });
}

test('published package registers only branded identity, avoiding global legacy credential collisions',()=>{
 const manifest=require('../package.json');
 assert.deepEqual(manifest.n8n.credentials,['dist/credentials/FiftyWOAuth2Api.credentials.js']);
 assert.deepEqual(manifest.n8n.nodes,['dist/nodes/FiftyW/FiftyW.node.js']);
});
