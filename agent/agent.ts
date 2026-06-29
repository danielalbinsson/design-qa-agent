import { defineAgent } from "eve";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// All agents route through OpenRouter (not the Vercel AI Gateway default).
// openrouter("<id>") returns a provider-authored LanguageModel, which
// defineAgent accepts in place of a gateway model-id string.
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Root = orchestrator. It owns no tools of its own in this slice; it
// delegates to the declared `a11y-auditor` subagent (exposed as a tool by
// its directory name) and presents the fused result.
export default defineAgent({
  model: openrouter("anthropic/claude-sonnet-4.6"),
  // OpenRouter models aren't in the AI Gateway catalog; provide context size for compaction.
  modelContextWindowTokens: 200_000,
});
