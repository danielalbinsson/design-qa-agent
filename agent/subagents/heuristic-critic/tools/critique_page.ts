import { defineTool } from "eve/tools";
import { z } from "zod";

// Capture a screenshot via Browserless, then critique it with an OpenRouter
// vision model. The vision call lives here (not in the agent's model) because
// eve tool results are text/json — we can't pass the agent's model a raw image.
const BROWSERLESS_BASE =
  process.env.BROWSERLESS_URL ?? "https://production-sfo.browserless.io";
const VISION_MODEL = process.env.VISION_MODEL ?? "anthropic/claude-sonnet-4.6";

const RUBRIC = `You are a senior UX/accessibility reviewer. Critique this screenshot for issues that automated checkers miss:
- Visual hierarchy, grouping/proximity, and findability of primary actions.
- Likely logical reading/focus order problems.
- Alt-text/labeling quality cues visible in the UI.
- WCAG 2.2 interaction criteria: target size (>=24x24px), focus visibility, dragging alternatives.
- Nielsen's 10 usability heuristics where visibly relevant.
Return ONLY a JSON array. Each item: {"title","region","impact":"critical|serious|moderate|minor","wcag"(optional),"recommendation"}. No prose.`;

async function captureScreenshot(url: string): Promise<string> {
  const res = await fetch(
    `${BROWSERLESS_BASE}/screenshot?token=${process.env.BROWSERLESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        options: { type: "png", fullPage: true },
        gotoOptions: { waitUntil: "networkidle2", timeout: 60000 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Browserless /screenshot failed: ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

export default defineTool({
  description:
    "Capture a full-page screenshot of a URL and critique its UX/visual quality with a vision model. Returns heuristic findings automated a11y checkers miss.",
  inputSchema: z.object({
    url: z.string().url(),
  }),
  async execute({ url }) {
    const base64 = await captureScreenshot(url);

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: RUBRIC },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter vision call failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "[]";

    // The model may wrap JSON in a code fence; strip it before parsing.
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let items: unknown = [];
    try {
      items = JSON.parse(cleaned);
    } catch {
      items = [{ title: "Vision output was not valid JSON", region: "n/a", impact: "minor", recommendation: raw.slice(0, 400) }];
    }

    return { url, items };
  },
});
