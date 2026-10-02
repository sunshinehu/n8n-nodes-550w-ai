# 550W Watermark & Text Eraser for n8n

Native OAuth + REST integration. This node does not send MCP JSON-RPC requests.
It processes PNG/JPEG/WebP images (50 MB maximum), MP4/MOV binary videos (200 MB
maximum), public HTTPS video URLs, and TikTok/X share links. Video dimensions and
duration are probed by the server; the default erase region is the full frame.
Pixel coordinates are advanced options, checked against the real video by the server.

## Connection setup

Use a current n8n release supporting static OAuth with `usePkce` and RFC 8707
resource indicators. The previously tested n8n 2.40.7 MCP workflow is **not**
evidence that this new REST integration passes end-to-end verification.

1. Create the **550W Media OAuth2 API** credential.
2. Copy its exact HTTPS OAuth callback URL to the server administrator.
3. Register a separate confidential client for this n8n installation (see
   [server setup](docs/server-setup.md)).
4. Enter the registered Client ID and Client Secret in n8n, then connect your
   550W account. These are OAuth application credentials, not a user API key.
5. Existing MCP OAuth credentials must be reconnected: the audience is now
   `https://www.550wai.cn/media-api/global`.

Authorization and token issuance share the existing authorization service.
The global resource selects the existing international English consent page.
Requested scopes: credits:read, tasks:read, tasks:submit, media:upload. No deletion
scope. n8n owns OAuth callback, encrypted credential storage and token refresh.

This package targets the international channel. English product copy and the
international processing/recharge entry are at https://eraser.550wai.com/.
It does not silently route domestic media through the international product.

## Workflow actions

- Account: read available credits and whether processing is enabled.
- Image: remove image watermark from an input binary field, or query its task.
- Video: remove text/watermarks from an input binary or a public direct URL;
  resolve a platform share link; query an existing video task.
- Operation receipt: recover the outcome of a submission using the same Operation ID.

Paid operations require **I Approve Upload and Credit Usage** and a stable
8–64 character Operation ID. Do not generate a new ID automatically on retry.
Use a unique ID per input item; repeat the same ID only with identical input.
The server rejects conflicting reuse.

Binary uploads first obtain a five-minute, single-use upload ticket over OAuth
REST, then send multipart data only to the fixed 550W media endpoint with that
ticket. No Bearer token is copied into multipart headers and upload transport
cannot automatically replay a consumed stream during an OAuth refresh.
Filesystem-backed binary data is streamed, byte-count checked and closed on both
success and failure. Inline binary uses multipart FormData. Redirects are disabled.

A submission may return `preparing`. Query its operation receipt until a task
ID is available, then query the image/video task. Use a Wait node and bounded
polling appropriate to the media size. This node does not claim the first receipt
is a completed task and does not automatically resubmit on timeout.
If a share-link result cannot be downloaded, provide the resolved video URL
returned in the receipt so the user can download it in a browser. Do not replace
it with the originally submitted platform share URL.

AI Tool invocations are read-only; an execution guard rejects paid operations
even when a workflow supplies their parameters directly.

## Migration and verification

### Importable examples

Import a JSON workflow from the examples directory, then select your own
550W OAuth credential on the node:

- [Account credits](examples/account-credits.json): read-only connection check.
- [Video URL submission](examples/video-submit.json): replace the public URL and
  Operation ID, review credit usage, then explicitly enable approval.
- [Operation recovery](examples/operation-recovery.json): use the same ID from
  the submission to recover its receipt without submitting again.

No example contains credentials, enables paid processing by default, or is active.
For binary processing, connect a preceding node's binary output and select
Remove Image Watermark or Remove Video Text From Binary File with its binary field.
If the account response reports processingEnabled=false, the server administrator
must complete rollout before paid operations can run.

Node version 2 replaces the legacy `videoUpload` / `subtitleMedia` two-stage
MCP workflow with **Remove Video Text From Binary File**. Old upload actions fail
with an explicit migration message rather than becoming paid submissions.
Old video URL workflows must provide Operation ID instead of idempotencyKey.
Recreate/reconnect credentials after upgrading; saved DCR field values from old
credentials may otherwise override new defaults.

```sh
npm ci
npm run lint
npm test
npm pack --dry-run
```

For a real HTTP-helper transport check (without paid tasks), run
`node scripts/transport-smoke.cjs /absolute/path/to/n8n/node_modules`.
This starts only a local echo server and checks multipart transport using the
installed n8n runtime; it does not verify production OAuth or processing.

Local build/tests do not prove the deployed service is enabled or that a real
OAuth round-trip/refresh/revocation works. Before publication, verify exact callback,
fresh login, refresh, revocation, image and short video processing, receipt recovery
and result URLs against the deployed service. No review acceptance is implied.

Package name stays `n8n-nodes-fiftyw-media`. Historical npm versions 0.1.x used MCP
and were not accepted by manual review; this REST migration requires a new review.
