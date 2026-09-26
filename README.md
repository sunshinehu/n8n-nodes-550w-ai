# n8n 550W AI community node prototype

The global node uses 550W web OAuth and remote MCP. No 550W API Key or user number is requested. It queries credits, image tasks and subtitle tasks; submits short-video watermark removal with an explicit 1-credit confirmation; uploads one PNG, JPEG or WebP image from an n8n binary field with an explicit 10-credit confirmation; and submits subtitle removal from a public direct video URL after quoting its actual dimensions and credit cost. A separate **Upload Video** action accepts one MP4 or MOV binary up to 200 MB and returns a temporary `mediaId` plus probed dimensions. Feed these into **Submit Subtitle Task From Uploaded Video** and provide a stable idempotency key. The two-step design keeps the exact media ID and key available for recovery after an unknown paid submission. The node is deliberately unavailable as an AI Tool: a model could otherwise set the charge-confirmation parameter on its own. A human must configure the paid workflow step. All operations still need a real n8n OAuth and task test before a marketplace release.

## Build

```bash
npm ci
npm run lint
npm run build
```

The credential extends n8n's OAuth2 credential with Dynamic Client Registration and fixes the resource to `https://www.550wai.cn/mcp/global`. n8n owns the OAuth callback and token refresh. The server's existing DCR path should issue a PKCE public client, with account authorization performed on the 550W website. A real n8n instance must verify registration, the `resource` parameter on authorization and token requests, refresh, task calls, and revocation; passing TypeScript build/lint is insufficient. Do not publish the npm package or claim one-click connection until this test passes.

For a paid submission, the user must explicitly enable **I Confirm the Credit Charge** and provide a stable `operationId`. Image upload requests a short-lived ticket via OAuth MCP, then sends the binary and ticket only to the exact 550W global image upload path; it does not place a Bearer token in the multipart request. After a timeout, inspect 550W tasks and reuse the same ID. Workflows must not automatically generate a fresh ID for retry. Server task and credit records are authoritative.

The package is not on npm or n8n's community directory. To release, create a dedicated public repository, run a real n8n install test, complete binary media operations or narrow the public description to the supported actions, publish to npm, and request n8n verification. Follow the [official starter](https://github.com/n8n-io/n8n-nodes-starter) and [OAuth credential documentation](https://docs.n8n.io/integrations/builtin/credentials/httprequest/).
