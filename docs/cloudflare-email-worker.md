# Cloudflare Email Worker

Current live mailbox architecture:

`Cloudflare Email Routing -> Cloudflare Email Worker(email) -> mailbox bridge -> local agent-mail-worker -> RemoteLab -> completion target -> Cloudflare Email Worker(fetch) -> Cloudflare send_email`

## Why this shape

- Cloudflare only provides the atomic email capabilities: receive and send
- RemoteLab keeps the business logic: filtering, review, automation, session routing, and replies
- Provider migration stays easier because the internal mailbox workflow is not embedded in edge code

## Repo-ready state

- Worker name: `remotelab-email-worker`
- Example Worker URL: `https://remotelab-email-worker.example.workers.dev`
- Example public mailbox webhook: `https://mailhook.example.com/cloudflare-email/webhook`
- Example sender address: `agent@example.com`
- Inbound routing: Cloudflare Email Routing rule sends your mailbox alias to the Worker
- Outbound replies: RemoteLab completion targets call the Worker `fetch` endpoint, which uses Cloudflare `send_email`

## Worker configuration

Copy `cloudflare/email-worker/wrangler.example.jsonc` to `cloudflare/email-worker/wrangler.jsonc`, then fill in your own values. The local `wrangler.jsonc` copy stays gitignored.

The thin-edge config keeps only:

- `MAILBOX_FROM`
- `MAILBOX_BRIDGE_URL`

Secrets uploaded during deploy:

- `OUTBOUND_API_TOKEN`
- `MAILBOX_BRIDGE_TOKEN`

The Worker no longer carries RemoteLab login/session orchestration config. That logic now lives only in the local mailbox stack.

## Local outbound config

Recommended mailbox `outbound.json` shape:

```json
{
  "provider": "cloudflare_worker",
  "workerBaseUrl": "https://remotelab-email-worker.example.workers.dev",
  "from": "agent@example.com",
  "workerToken": "<same token uploaded as OUTBOUND_API_TOKEN>"
}
```

## Deploy

```bash
cd ~/code/remotelab/cloudflare/email-worker
cp wrangler.example.jsonc wrangler.jsonc
./deploy.sh
```

The deploy script reads local mailbox config, uploads the outbound and bridge secrets, and deploys the Worker.

## Validation

Useful checks:

```bash
curl https://remotelab-email-worker.example.workers.dev/healthz
curl https://mailhook.example.com/healthz
node tests/test-agent-mail-http-bridge.mjs
node tests/test-agent-mail-reply.mjs
node tests/test-agent-mail-worker.mjs
```

## Notes

- No Forward Email dependency
- No SMTP setup
- `apple_mail` remains as a local fallback outbound provider for manual testing
