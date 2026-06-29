import { defineAgent } from "eve";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// The vision work happens inside the `critique_page` tool (eve tool results are
// text/json to the model, so we can't hand the agent's own model a raw image).
// This agent just frames the request and normalizes the tool's findings, so a
// cheap text model is fine here.
export default defineAgent({
  description:
    "Critiques a page's visual/UX quality from a screenshot — hierarchy, grouping, focus order, alt-text quality, and WCAG 2.2 interaction criteria that automated checkers miss.",
  // "anthropic/claude-3.5-haiku" 404s on OpenRouter (subagent returned empty).
  // sonnet-4.6 is proven to resolve; swap to a verified cheaper id if desired.
  model: openrouter("anthropic/claude-sonnet-4.6"),
  modelContextWindowTokens: 200_000,
});
