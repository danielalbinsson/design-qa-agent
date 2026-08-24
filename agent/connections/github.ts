import { defineMcpClientConnection } from "eve/connections";
import { requireEnv } from "../lib/env";

// GitHub's remote MCP server. The orchestrator discovers its tools via the
// built-in `connection_search` and calls them as `github__<tool>` (e.g. a
// "add comment to a PR/issue" tool) to post the fused review.
//
// Auth: a GitHub Personal Access Token (fine-grained, with Pull requests:
// read+write on the target repos) sent as `Authorization: Bearer <token>`.
// `description` is REQUIRED on every eve connection.
//
// Verify against your setup:
//   - Server URL: GitHub's remote MCP base is `https://api.githubcopilot.com/mcp/`.
//     You can scope toolsets via a path suffix (e.g. `.../x/pull_requests`) or
//     use the read-only variant if you only need reads.
//   - If you prefer OAuth over a PAT, swap `auth` for `connect("github/<uid>")`
//     from `@vercel/connect/eve` (user-scoped) — needs a registered Connect client.
export default defineMcpClientConnection({
  url: process.env.GITHUB_MCP_URL ?? "https://api.githubcopilot.com/mcp/",
  description:
    "GitHub: read pull request metadata and post review comments on PRs.",
  auth: {
    getToken: async () => ({ token: requireEnv("GITHUB_TOKEN") }),
  },
});
