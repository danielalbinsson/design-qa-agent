# Deploy to Vercel — runbook

Run these from your **own Terminal** in the project root (not from the agent
sandbox). Assumes the project is its own git repo and you have the Vercel CLI
(`npm i -g vercel`) logged in. Prefer `pnpm` in this repo.

## 0. Pre-flight

```bash
pnpm install
pnpm run build          # eve build — must succeed locally first
```

Open `.eve/compile/compiled-agent-manifest.json` and confirm it lists all three
subagents (`a11y-auditor`, `heuristic-critic`, `design-system-checker`), their
tools, and the `eve` channel. (This is also what Aletheia reads.)

> No sandbox is defined in this agent (no shell/file tools), so Vercel Sandbox
> prewarm is skipped — one less thing to fail at build time.

## 1. Link the project

```bash
vercel link            # pick/create the Vercel project
```

## 2. Set environment variables

Set these for **Production** (and Preview if you'll test previews). Either via
`vercel env add <NAME> production` or the dashboard → Settings → Environment
Variables:

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | Model calls for every agent + the vision tool. |
| `BROWSERLESS_TOKEN` | yes | Headless Chrome for axe / screenshot / computed styles (Authorization header). |
| `BROWSERLESS_URL` | yes | Your region base, e.g. `https://production-sfo.browserless.io`. |
| `VISION_MODEL` | no | Defaults to `anthropic/claude-sonnet-4.6`. |
| `DESIGN_TOKENS_URL` | no | Public http(s) DTCG/Style Dictionary JSON; omit to report observed values only. |
| `ROUTE_AUTH_BASIC_PASSWORD` | yes | HTTP Basic password — must match `curl -u $ROUTE_AUTH_BASIC_USER:$ROUTE_AUTH_BASIC_PASSWORD`. Empty → deploy rejects traffic. |
| `ROUTE_AUTH_BASIC_USER` | no | Defaults to `daniel`. |
| `GITHUB_TOKEN` | for PR mode | GitHub PAT (Pull requests: read+write) for the `github` connection. |
| `GITHUB_MCP_URL` | no | Override the GitHub MCP server URL. |

Because the agents use a **direct OpenRouter provider** (not the Vercel AI
Gateway), you do **not** need `AI_GATEWAY_API_KEY` or gateway OIDC for model
calls.

Route auth is **`httpBasic` (only when `ROUTE_AUTH_BASIC_PASSWORD` is set) +
`localDev()`** in `agent/channels/eve.ts`. Do not rely on `vercelOidc()` for
driving this deployment — the local CLI OIDC token often fails project matching.
Audit targets and `DESIGN_TOKENS_URL` must be **public http(s)** URLs.

## 3. Deploy

```bash
vercel deploy          # preview build
# or
vercel deploy --prod   # production
```

Use plain `vercel deploy` (let Vercel build in its hosted environment) — **not**
`--prebuilt`, per the eve deploy guide.

## 4. Verify

Health is public:

```bash
curl https://<your-app>.vercel.app/eve/v1/health
```

Drive a real turn with HTTP Basic (this is the supported path):

```bash
curl -u "daniel:$ROUTE_AUTH_BASIC_PASSWORD" -X POST \
  https://<your-app>.vercel.app/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"Audit https://example.com for design QA"}'
# → { "sessionId": "wrun_…", … }

curl -u "daniel:$ROUTE_AUTH_BASIC_PASSWORD" \
  https://<your-app>.vercel.app/eve/v1/session/<sessionId>/stream
```

Local interactive (no Basic needed — `localDev()`): `nvm use 24 && pnpm run dev`.

If the deployment uses Vercel preview protection, set
`VERCEL_AUTOMATION_BYPASS_SECRET` on curl/preview requests as well.

## 5. Watch it run

In the Vercel dashboard: **Observability → Agent Runs** (gated feature — ask your
Vercel contact to enable it for your team if the tab is missing) to browse
sessions and drill into the staged subagent trace (a11y + design-system, then
heuristic). Logs live under **Observability → Logs**. Prefer **child session
streams** when debugging empty specialist output — the parent can look “successful”
while a child 404’d on the model.

## Common failures

- **Build fails on a provider import** → make sure `@openrouter/ai-sdk-provider`
  is in `dependencies` (it is) and the version matches your eve toolchain.
- **All turns 401** → route auth working; use `curl -u $ROUTE_AUTH_BASIC_USER:$ROUTE_AUTH_BASIC_PASSWORD`.
- **All turns rejected / no Basic accepted** → `ROUTE_AUTH_BASIC_PASSWORD` is
  empty; httpBasic is not registered (fail-closed). Set the env var and redeploy.
- **Tool rejects URL** → only public http(s) URLs are allowed (no localhost /
  private / metadata hosts).
- **Tool calls time out** → Browserless cold start + page load; bump the
  function's max duration in Vercel project settings if needed.
- **a11y / styles return empty title/url** → Browserless `/function` payloads must
  unwrap `{ data, type }` (handled in `agent/lib/browserless.ts`). Redeploy if
  prod predates that fix.
- **429 from Browserless** → concurrent specialist calls; tools retry with backoff
  (including network errors).
- **Vision tool returns "not valid JSON"** → the model wrapped output; the tool
  extracts the first JSON array, but check `VISION_MODEL` actually supports images.
- **Screenshot too large for vision** → full-page JPEG exceeded the size cap;
  measured findings still return; vision judgment is skipped.
