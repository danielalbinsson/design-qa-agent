import { defineAgent } from "eve";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Compares the page's rendered values against the design system's tokens.
// Reasoning-light matching work — a mid/cheap text model is enough.
export default defineAgent({
  description:
    "Checks a page's rendered colors, spacing, radii, and type scale against the design system's tokens, flagging off-system values.",
  // "anthropic/claude-3.5-haiku" 404s on OpenRouter (subagent returned empty).
  // sonnet-4.6 is proven to resolve; swap to a verified cheaper id if desired.
  model: openrouter("anthropic/claude-sonnet-4.6"),
  modelContextWindowTokens: 200_000,
});
