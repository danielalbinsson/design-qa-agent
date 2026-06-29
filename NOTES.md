# Design QA Agent — Notes, Learnings & Known Issues

A standalone [eve](https://eve.dev) agent built to learn the framework end-to-end:
build → deploy on Vercel → run live → find bugs. It works. This file records what
broke, why, and what's still open — so the next person (or future you) doesn't
relive the debugging.

## What it is

An orchestrator (root agent) that fans out to three declared subagents in
parallel and fuses their findings into one design-QA report for a URL:

- **a11y-auditor** → `run_axe` (axe-core in headless Chrome via Browserless)
- **heuristic-critic** → `critique_page` (screenshot + OpenRouter vision model)
- **design-system-checker** → `get_computed_styles` + `read_design_tokens`

Plus a GitHub MCP connection (PR-comment mode), HTTP Basic route auth, and
OpenRouter models. Deployed on Vercel.

## Architecture decisions worth remembering

- **OpenRouter, not the AI Gateway.** eve's string `model` routes through the
  Vercel AI Gateway; to use OpenRouter you pass a provider model via
  `@openrouter/ai-sdk-provider`. And because OpenRouter models aren't in the
  Gateway catalog, **set `modelContextWindowTokens` on every `defineAgent`**
  (root + subagents) or compaction has no window to work against.
- **Browserless, not bundled Chromium.** Running Playwright/Puppeteer + Chromium
  inside a Vercel function busts the 250 MB limit and cold-start budget. The
  tools call Browserless's hosted Chrome over HTTP instead.
- **Vision happens inside the tool.** eve tool results are text/json, so a
  subagent's model can't be handed a raw image. `critique_page` screenshots and
  calls the vision model itself, returning parsed findings.
- **Subagents inherit nothing.** Each declared subagent has its own `tools/`
  (and would need its own `connections/`). The GitHub connection is root-only —
  the orchestrator is the sole writer.

## Bugs found (the actual learning)

1. **`modelContextWindowTokens` required for OpenRouter models** — without it,
   compaction can't size the window. Added to every agent.

2. **eve fails closed on deploy** — a deployed agent with no channel auth
   rejects all traffic. `/eve/v1/health` stays public; everything else needs a
   policy in `agent/channels/eve.ts`.

3. **`vercelOidc()` rejected `eve dev <url>`** ("the selected Vercel project did
   not authorize…") because the local CLI's OIDC token didn't match the
   deployment's project/env. Switched to **`httpBasic()` + `curl -u`**, which is
   the reliable way to drive a solo deployed agent. (`eve dev`'s TUI has no flag
   to send Basic creds, so curl it.)

4. **Browserless `/function` navigation** — two traps:
   - The JSON `context` object isn't reliably passed into the function, so
     `page.goto(context.url)` left the page on Browserless's own runner page.
     **Fix: inline the URL into the code string.**
   - Reading `document.title` / `location.href` in the function's *Node* scope
     returns Browserless's runner page values (a false "wrong page" signal that
     cost a long detour). **Fix: use `await page.title()` / `page.url()`.**
   - Send code as `Content-Type: application/javascript` (raw body).

5. **LLM confabulation on terse tool data** — early reports invented
   e-commerce labels ("Shop Now", "Learn More", footer nav) that weren't on the
   page, dressing up real-but-abstract axe data (rule `button-name` on `.h-5`).
   Hardened the prompts: report only tool output, never invent element names,
   surface tool failures instead of papering over them.

6. **Subagents returned empty → the real one.** Declared subagents returned
   empty output on every call; the orchestrator silently fell back to a debug
   tool. The parent trace was useless. **Reading the child session stream**
   (`GET /eve/v1/session/<childSessionId>/stream`) revealed the truth:
   `MODEL_CALL_FAILED — No endpoints found for anthropic/claude-3.5-haiku (404)`.
   That model id doesn't exist on OpenRouter. Switched subagents to
   `anthropic/claude-sonnet-4.6`. **Lesson: trust the child trace, not the
   parent's "completed successfully."**

## Known issues / open items

- **a11y under-reports under parallel fan-out.** When the three subagents hit
  Browserless simultaneously, `a11y-auditor` has come back "clean" while a
  solo probe found 3 real axe violations (`button-name`, `color-contrast`,
  `heading-order`). Likely a not-fully-rendered page or a throttled concurrent
  session. Fix options: delegate sequentially, or make `run_axe` wait for full
  load / retry. Treat axe "clean" with suspicion until fixed.
- **Vision findings can over-assert.** `heuristic-critic` output is plausible and
  page-specific, but spot-check specifics before acting on them.
- **Cost.** All agents currently run on `claude-sonnet-4.6`. Swap subagents to a
  cheaper model id you've verified exists on openrouter.ai/models (the
  `claude-3.5-haiku` slug is dead; current cheap option is Claude Haiku 4.5).
- **`debug_probe` (removed).** A temporary root tool that returned raw Browserless
  output with no LLM in the loop — it was how the wrong-page and 404 bugs were
  found. Deleted now that the pipeline is trusted; re-add a similar raw-output
  probe if you need to debug the tool layer again.
- **Design tokens**: set `DESIGN_TOKENS_URL` to a raw DTCG/Style-Dictionary JSON
  to turn `design-system-checker` from "observed values" into pass/fail.

## How to run

Local interactive (needs Node 24): `nvm use 24 && pnpm run dev`, type a URL.
Deployed: `vercel deploy --prod`, then `curl -u daniel:$ROUTE_AUTH_BASIC_PASSWORD`
the `/eve/v1/session` route and stream `/eve/v1/session/<id>/stream`.
PR mode: message `Review PR <github-pr-url> — preview at <preview-url>`.

## Observability lesson (for Aletheia)

Every high-level signal lied at least once: a polished report built on the wrong
page; "all subagents completed successfully" when they'd 404'd; a `title` field
that reported the wrong page. Only **raw tool output and child-session traces**
were trustworthy. Strong argument for surfacing child-session errors and raw
tool I/O prominently in Aletheia's `/observe`.
