# Deploy to Vercel — runbook

Run these from your **own Terminal** in the project root (not from the agent
sandbox). Assumes the project is its own git repo and you have the Vercel CLI
(`npm i -g vercel`) logged in.

## 0. Pre-flight

```bash
npm install
npm run build          # eve build — must succeed locally first
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
| `BROWSERLESS_TOKEN` | yes | Headless Chrome for axe / screenshot / computed styles. |
| `BROWSERLESS_URL` | yes | Your region base, e.g. `https://production-sfo.browserless.io`. |
| `VISION_MODEL` | no | Defaults to `anthropic/claude-sonnet-4.6`. |
| `DESIGN_TOKENS_URL` | no | DTCG/Style Dictionary JSON; omit to report observed values only. |
| `ROUTE_AUTH_BASIC_PASSWORD` | yes | Route auth — must match what you pass to `curl -u`. |
| `GITHUB_TOKEN` | for PR mode | GitHub PAT (Pull requests: read+write) for the `github` connection. |
| `GITHUB_MCP_URL` | no | Override the GitHub MCP server URL. |

Because the agents use a **direct OpenRouter provider** (not the Vercel AI
Gateway), you do **not** need `AI_GATEWAY_API_KEY` or gateway OIDC for model
calls. `vercelOidc()` route auth still uses project OIDC automatically.

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

Drive a real turn. The session/stream routes are guarded by `vercelOidc()` +
`localDev()`, so the easy path is the dev TUI pointed at the deployment:

```bash
vercel link            # if not already linked, so a project OIDC token resolves
npx eve dev https://<your-app>.vercel.app
# then: "Audit https://example.com for design QA"
```

If the deployment uses Vercel preview protection, set
`VERCEL_AUTOMATION_BYPASS_SECRET` locally before `eve dev`.

> Want to hit it with plain `curl`/Postman from anywhere instead? Switch
> `agent/channels/eve.ts` to the `httpBasic(...)` walk (commented in that file),
> set `ROUTE_AUTH_BASIC_PASSWORD`, and send an `Authorization: Basic ...` header.
> Verify `httpBasic`'s exact signature against your installed eve first.

## 5. Watch it run

In the Vercel dashboard: **Observability → Agent Runs** (gated feature — ask your
Vercel contact to enable it for your team if the tab is missing) to browse
sessions and drill into the three-way parallel subagent trace. Logs live under
**Observability → Logs**.

## Common failures

- **Build fails on a provider import** → make sure `@openrouter/ai-sdk-provider`
  is in `dependencies` (it is) and the version matches your eve toolchain.
- **All turns 401** → that's route auth working; use `eve dev <url>` with a
  linked project, or switch to httpBasic.
- **Tool calls time out** → Browserless cold start + page load; bump the
  function's max duration in Vercel project settings if needed.
- **Vision tool returns "not valid JSON"** → the model wrapped output; the tool
  already strips code fences, but check `VISION_MODEL` actually supports images.
