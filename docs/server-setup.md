# n8n native OAuth + media REST integration

The n8n frontend is the native credential editor and node parameters in
`mcp-distribution/n8n-nodes-550w`. It uses the same media REST engine as browser
extensions, not the remote MCP transport. Existing browser public clients remain
unchanged; confidential REST clients now also pass static registration validation.

## Deployment prerequisites

Use the existing external static-client configuration file. Do not replace the
whole file with the following example; merge the new client with existing entries.
Enable existing gates:

```properties
wai.oauth.enabled=true
wai.oauth.static-client.enabled=true
wai.oauth.static-clients-file=/absolute/path/to/approved-clients.json
wai.media-api.enabled=true
wai.media-api.paid.enabled=true
```

Before deploying this Server revision, apply the additive migration
`Server/docs/migrations/20261001_extend_media_task_preparation.sql` and verify the
production schema contract. It only extends the existing video/image task tables;
old inserts and legacy billing modes remain valid. Both nodes must share the existing
static/temp filesystem and its existing video-transcode/image-eraser directories.

The last gate enables paid processing globally; do not turn it on without checking
the current operational rollout. No separate import-queue tables or browser
CORS wildcard are required; existing image/video business tasks remain authoritative.
n8n makes server-to-server HTTP requests with no Origin header.
Keep browser allowed origins exact.

Template (replace callback and secret with deployment-specific values):

```json
{
  "clientId": "skill-550w-n8n-global",
  "clientName": "550W Watermark & Text Eraser",
  "clientSecret": "REPLACE_WITH_A_UNIQUE_SECRET_OF_AT_LEAST_32_CHARACTERS",
  "authMethod": "client_secret_post",
  "region": "global",
  "enabled": true,
  "mcpApi": false,
  "mediaApi": true,
  "mediaClientPlatform": "n8n",
  "scopes": ["credits:read", "tasks:read", "tasks:submit", "media:upload"],
  "redirectUris": ["https://YOUR-N8N-HOST/rest/oauth2-credential/callback"]
}
```

Copy the actual callback displayed by n8n; hosted and self-hosted deployments can
differ. HTTPS only, exact callback matching, PKCE S256 required. Use separate
clients/secrets for installations with different owners. This template is not a
registered production client or a public/shared client secret.

Resource/audience: `https://www.550wai.cn/media-api/global`.
Authorization service: `https://www.550wai.cn/oauth2/authorize`.
Token service: `https://www.550wai.cn/oauth2/token`.
The resource selects the existing English overseas frontend; CN OAuth resources
still select the existing Chinese frontend. Neither page/domain was replaced.

## HTTP contract and recovery

- GET /media-api/global/v1/account: credits:read.
- GET /media-api/global/v1/capabilities: tasks:read; authoritative service limits.
- POST /media-api/global/v1/upload-ticket: tasks:submit and media:upload.
- POST /media-api/global/v1/media: JSON source URL or multipart binary.
- GET /media-api/global/v1/operations/{operationId}: tasks:read.
- GET /media-api/global/v1/tasks/{image|video}/{taskId}: tasks:read.

The upload ticket is single-use and expires after five minutes. Ticket consumption
still validates the underlying OAuth token, grant, scope and media audience.
Keep the upload endpoint fixed and disable redirects. Multipart requests do not
use OAuth's automatic refresh retry, avoiding replay of consumed binary streams.

Operation receipts are async: preparing is not final success. Unknown receipts
must never cause automatic re-execution; query the same receipt/task instead.
The service owns metadata probing, SSRF protection, rectangle bounds, idempotency,
credit deduction and refunds. n8n does not supply guessed dimensions or prices.

## Observability boundary

Billing and task outcomes remain authoritative in existing business records.
`mediaClientPlatform: n8n` is trusted server registration metadata, not a request
header. New image/video tasks and HTTP events are attributed to `n8n/oauth`;
missing metadata is attributed to `unknown`, not a browser. Existing records
are not rewritten. Share-link provenance is in HTTP events;
its legacy billing table keeps its original semantics. These are
server-side workflow operations, not measured device DAU or client page funnels.
No media URLs/tokens enter analytics. Existing video tasks already carry source
URLs, preparation state, leases and recovery. New HTTP video tasks are persisted
before URL download/probing and charged in full only after verified preparation.
Image URL preparation uses the existing image task table and preserves successful-result
billing. Completed multipart inputs are saved to shared disk before admission.
Preparation leases are renewed while workers run; restart recovery uses task records,
not an additional import queue. Redis receipt loss can be recovered from task identity.
An interrupted supplier submission is not automatically replayed.

## Acceptance before deployment/publication

Local checks: static client registration and media security tests, n8n strict
lint, TypeScript build, execution tests and package file allowlist.

Remaining production acceptance: configure an actual exact callback, issue an
installation-specific client, reconnect OAuth, verify account query, token
refresh/revocation, image and one-second video, share-link resolution, timeout
receipt recovery and result links. No real paid task is launched by local tests.
Do not interpret historical MCP tests or npm publication as REST verification.

## Video duration

Browser and n8n media REST processing both support videos up to 600 seconds (10 minutes), including the exact boundary. The server verifies the real duration for both binary uploads and URL imports before admitting the paid task. Longer videos are rejected, not truncated. High-resolution conversion remains supported.
