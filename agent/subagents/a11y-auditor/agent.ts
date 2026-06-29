import { defineAgent } from "eve";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// A declared subagent inherits NOTHING from the root: it has only the
// instructions, tools, and connections authored under this directory.
// `description` is required — the parent reads it to decide when to delegate.
export default defineAgent({
  description:
    "Runs axe-core accessibility audits against a live URL in a real headless browser and returns normalized WCAG findings (violations + needs-review items).",
  // No vision needed here — keep it on a cheap, fast model.
  // NOTE: "anthropic/claude-3.5-haiku" is NOT a valid OpenRouter id (404 → the
  // subagent returned empty). Use a model your OpenRouter account resolves.
  // sonnet-4.6 is proven to work; swap to a cheaper verified haiku id if desired.
  model: openrouter("anthropic/claude-sonnet-4.6"),
  modelContextWindowTokens: 200_000,
});
