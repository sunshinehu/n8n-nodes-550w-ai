# n8n 550W AI community node prototype

The global node uses 550W web OAuth and remote MCP. No 550W API Key or user number is requested. It queries credits, image tasks and subtitle tasks; submits short-video watermark removal with an explicit 1-credit confirmation; uploads one PNG, JPEG or WebP image from an n8n binary field with an explicit 10-credit confirmation; and submits subtitle removal from a public direct video URL after quoting its actual dimensions and credit cost. A separate **Upload Video** action accepts one MP4 or MOV binary up to 200 MB and returns a temporary `mediaId` plus probed dimensions. Feed these into **Submit Subtitle Task From Uploaded Video** and provide a stable idempotency key. The two-step design keeps the exact media ID and key available for recovery after an unknown paid submission. The node is deliberately unavailable as an AI Tool: a model could otherwise set the charge-confirmation parameter on its own. A human must configure the paid workflow step.

## Build and local verification

```bash
npm ci
npm run lint
npm run build
npm run dev
```

The credential extends n8n's OAuth2 credential with Dynamic Client Registration and fixes the resource to `https://www.550wai.cn/mcp/global`. n8n owns the OAuth callback and token refresh. The server's existing DCR path issues a PKCE public client, with account authorization performed on the 550W website. Local n8n 2.40.7 testing on 2026-09-26 confirmed DCR authorization, credit query, a 1-credit short-video watermark removal, a 10-credit image task with a successful result URL, video binary upload, and a 4-credit subtitle task with a successful result URL. Refresh and revocation still require separate end-to-end checks.

In n8n 2.40.7, Dynamic Client Registration replaces the credential's requested scope with every scope advertised by the protected resource. The 550W consent page therefore currently includes `tasks:delete` even though this node has no delete action. Review the displayed permissions before connecting and revoke the grant from 550W's connection management page when it is no longer needed. This limitation must be reassessed before claiming minimum-scope authorization.

For a paid submission, the user must explicitly enable **I Confirm the Credit Charge** and provide a stable `operationId`. Image upload requests a short-lived ticket via OAuth MCP, then sends the binary and ticket only to the exact 550W global image upload path; it does not place a Bearer token in the multipart request. After a timeout, inspect 550W tasks and reuse the same ID. Workflows must not automatically generate a fresh ID for retry. Server task and credit records are authoritative.

The source is mirrored in the [dedicated public repository](https://github.com/sunshinehu/n8n-nodes-550w-ai). The [npm package](https://www.npmjs.com/package/n8n-nodes-fiftyw-media) was first published as 0.1.0. The initial `n8n-nodes-550w-ai` name was rejected by npm's package-name spam filter; the published technical name is `n8n-nodes-fiftyw-media`, while the user-facing node remains **550W AI Media**. To submit for n8n verification, publish a later version through the repository's tag-triggered GitHub Actions workflow with npm provenance. Configure npm Trusted Publishing for package `n8n-nodes-fiftyw-media`, GitHub repository `sunshinehu/n8n-nodes-550w-ai`, workflow `publish.yml`, and allow direct `npm publish`. Then submit the provenanced version to the n8n Creator Portal. See [n8n's current submission rules](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes/) and [OAuth credential documentation](https://docs.n8n.io/integrations/builtin/credentials/httprequest/).
