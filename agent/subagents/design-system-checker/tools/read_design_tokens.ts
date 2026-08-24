import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertPublicHttpUrl } from "../../../lib/url";

// Loads the design system's tokens. Source priority:
//   1. `source` input (a URL to a DTCG / Style Dictionary JSON), else
//   2. DESIGN_TOKENS_URL env var.
// If neither is set, returns { configured: false } so the checker degrades
// gracefully into "observed values, needs human review".
export default defineTool({
  description:
    "Load the design system's tokens (DTCG/Style Dictionary JSON) from a URL or the DESIGN_TOKENS_URL env var. Returns { configured: false } when no source is set.",
  inputSchema: z.object({
    source: z.string().url().optional(),
  }),
  async execute({ source }) {
    const url = source ?? process.env.DESIGN_TOKENS_URL;
    if (!url) {
      return { configured: false as const };
    }
    const safeUrl = await assertPublicHttpUrl(url);
    const res = await fetch(safeUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch design tokens: ${res.status} ${safeUrl}`);
    }
    const tokens = await res.json();
    return { configured: true as const, source: safeUrl, tokens };
  },
});
