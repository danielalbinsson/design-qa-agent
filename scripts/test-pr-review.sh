#!/usr/bin/env bash
#
# Test the Design QA agent's PR-review flow end to end.
#
# Usage:
#   scripts/test-pr-review.sh <github-pr-url> <preview-url>
#
# Example:
#   scripts/test-pr-review.sh https://github.com/danielalbinsson/site/pull/3 https://example.com
#
# Reads from .env (project root): GITHUB_TOKEN, ROUTE_AUTH_BASIC_PASSWORD,
# and optionally AGENT_URL and BASIC_AUTH_USER.
set -euo pipefail

# --- locate + load .env -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ No .env found at $ENV_FILE" >&2
  exit 1
fi
set -a; . "$ENV_FILE"; set +a

AGENT_URL="${AGENT_URL:-https://design-qa-agent.vercel.app}"
BASIC_AUTH_USER="${BASIC_AUTH_USER:-daniel}"

: "${GITHUB_TOKEN:?GITHUB_TOKEN missing from .env}"
: "${ROUTE_AUTH_BASIC_PASSWORD:?ROUTE_AUTH_BASIC_PASSWORD missing from .env}"

PR_URL="${1:-${PR_URL:-}}"
PREVIEW_URL="${2:-${PREVIEW_URL:-}}"
if [[ -z "$PR_URL" || -z "$PREVIEW_URL" ]]; then
  echo "Usage: $0 <github-pr-url> <preview-url>" >&2
  exit 1
fi

# --- parse owner/repo/number from the PR URL ----------------------------------
# https://github.com/<owner>/<repo>/pull/<n>
if [[ "$PR_URL" =~ github\.com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
  OWNER="${BASH_REMATCH[1]}"; REPO="${BASH_REMATCH[2]}"; PR_NUM="${BASH_REMATCH[3]}"
else
  echo "✗ Could not parse PR URL: $PR_URL" >&2
  exit 1
fi

JQ=""; command -v jq >/dev/null 2>&1 && JQ="jq"
# The agent reaches GitHub from Vercel, not this machine. If your local network
# blocks api.github.com (corporate proxy/VPN/TLS inspection → curl error 35),
# run with SKIP_PREFLIGHT=1 to skip the local GitHub calls and test the agent
# path only (then verify the comment in the browser).
SKIP_PREFLIGHT="${SKIP_PREFLIGHT:-0}"
gh_api() { curl -sS --connect-timeout 15 -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }

BEFORE_ID="0"
if [[ "$SKIP_PREFLIGHT" == "1" ]]; then
  echo "=== 1/4  GitHub preflight SKIPPED (SKIP_PREFLIGHT=1) ======================="
else
echo "=== 1/4  GitHub token preflight ==========================================="
WHOAMI="$(gh_api https://api.github.com/user)"
if [[ -n "$JQ" ]]; then echo "  authenticated as: $(echo "$WHOAMI" | jq -r '.login // "??"')"
else echo "  /user responded"; fi

echo "  repo access: $OWNER/$REPO"
REPO_JSON="$(gh_api "https://api.github.com/repos/$OWNER/$REPO")"
if [[ -n "$JQ" ]]; then
  echo "$REPO_JSON" | jq -e '.id' >/dev/null || { echo "✗ no access to repo"; echo "$REPO_JSON" | jq -r '.message'; exit 1; }
  echo "  permissions: $(echo "$REPO_JSON" | jq -c '.permissions // {}')"
fi

echo "  PR #$PR_NUM exists?"
PR_JSON="$(gh_api "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUM")"
if [[ -n "$JQ" ]]; then
  echo "$PR_JSON" | jq -e '.number' >/dev/null || { echo "✗ PR not found"; echo "$PR_JSON" | jq -r '.message'; exit 1; }
  echo "  title: $(echo "$PR_JSON" | jq -r '.title')"
fi

# remember the latest comment id so we can detect the new one afterwards
if [[ -n "$JQ" ]]; then
  BEFORE_ID="$(gh_api "https://api.github.com/repos/$OWNER/$REPO/issues/$PR_NUM/comments?per_page=100" | jq -r '(.[-1].id) // 0')"
fi
fi  # end preflight

echo "=== 2/4  Start agent session =============================================="
MSG="Review PR $PR_URL — preview at $PREVIEW_URL"
START="$(curl -sS -u "$BASIC_AUTH_USER:$ROUTE_AUTH_BASIC_PASSWORD" \
  -X POST "$AGENT_URL/eve/v1/session" \
  -H 'content-type: application/json' \
  -d "$(printf '{"message":%s}' "$(printf '%s' "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk '{printf "\"%s\"",$0}')")")"
echo "  $START"
if [[ -n "$JQ" ]]; then
  SESSION_ID="$(echo "$START" | jq -r '.sessionId // empty')"
else
  SESSION_ID="$(echo "$START" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p')"
fi
[[ -n "$SESSION_ID" ]] || { echo "✗ no sessionId returned (auth or build issue)"; exit 1; }
echo "  sessionId: $SESSION_ID"

echo "=== 3/4  Stream the run (Ctrl-C to stop) =================================="
# NDJSON; pretty-print event types + text deltas if jq is present.
curl -sS -N -u "$BASIC_AUTH_USER:$ROUTE_AUTH_BASIC_PASSWORD" \
  "$AGENT_URL/eve/v1/session/$SESSION_ID/stream" | while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if [[ -n "$JQ" ]]; then
    echo "$line" | jq -r '
      if .type=="text.delta" then .delta
      elif .type=="subagent.called" then "\n[→ subagent: \(.data.name // .data.childSessionId // "?")]"
      elif .type=="subagent.completed" then "[✓ subagent done]"
      elif (.type|test("tool")) then "[tool: \(.type)]"
      elif .type=="message.completed" then "\n--- message.completed ---"
      else empty end' 2>/dev/null || echo "$line"
  else
    echo "$line"
  fi
done

echo
echo "=== 4/4  Check for a new PR comment ======================================="
if [[ "$SKIP_PREFLIGHT" == "1" ]]; then
  echo "  skipped (local GitHub calls disabled) — open the PR in your browser:"
  echo "    $PR_URL"
elif [[ -n "$JQ" ]]; then
  NEW="$(gh_api "https://api.github.com/repos/$OWNER/$REPO/issues/$PR_NUM/comments?per_page=100" \
    | jq --argjson before "$BEFORE_ID" '[.[] | select(.id > $before)]')"
  COUNT="$(echo "$NEW" | jq 'length')"
  if [[ "$COUNT" -gt 0 ]]; then
    echo "  ✓ $COUNT new comment(s) posted:"
    echo "$NEW" | jq -r '.[] | "    \(.html_url)"'
  else
    echo "  ✗ no new comment found — check the stream above for a GitHub tool error"
  fi
else
  echo "  (install jq for automatic comment detection; otherwise check the PR in the browser)"
fi
echo "Done."
