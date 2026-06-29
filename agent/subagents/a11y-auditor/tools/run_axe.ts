import { defineTool } from "eve/tools";
import { z } from "zod";

// Browserless runs a real headless Chrome and lets us inject + run axe-core in
// the page, then returns the JSON result. We deliberately do NOT bundle
// Chromium into the Vercel function (the "headless-Chrome-on-Vercel trap").
const BROWSERLESS_BASE =
  process.env.BROWSERLESS_URL ?? "https://production-sfo.browserless.io";

// IMPORTANT: Browserless's /function does NOT reliably pass our `context` object
// into the function (the signature it invokes doesn't hand it through), so the
// URL must be INLINED into the code string. Relying on context.url left goto on
// Browserless's default runner page and we audited the wrong page.
function buildAxeCode(url: string, tags: string[]): string {
  return `export default async function ({ page }) {
    await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 60000 });
    await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js" });
    const results = await page.evaluate(async (tags) => {
      return await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    }, ${JSON.stringify(tags)});
    const pageTitle = await page.title();
    const pageUrl = page.url();
    return { data: { title: pageTitle, url: pageUrl, results }, type: "application/json" };
  }`;
}

type AxeNode = { target?: string[] };
type AxeRule = {
  id: string;
  impact?: string;
  help?: string;
  tags?: string[];
  nodes?: AxeNode[];
};

const mapRule = (r: AxeRule) => ({
  id: r.id,
  impact: r.impact ?? "minor",
  help: r.help ?? r.id,
  wcag: (r.tags ?? []).filter((t) => t.startsWith("wcag")),
  nodeCount: r.nodes?.length ?? 0,
  sampleSelector: r.nodes?.[0]?.target?.join(" ") ?? "",
});

export default defineTool({
  description:
    "Run an axe-core accessibility audit against a URL in a real headless browser (via Browserless). Returns WCAG violations and incomplete (needs-review) items, plus the audited page's title/url so the caller can confirm the right page loaded.",
  inputSchema: z.object({
    url: z.string().url(),
    standard: z.enum(["wcag21aa", "wcag22aa"]).default("wcag22aa"),
  }),
  async execute({ url, standard }) {
    const tags =
      standard === "wcag22aa"
        ? ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
        : ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

    const res = await fetch(
      `${BROWSERLESS_BASE}/function?token=${process.env.BROWSERLESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/javascript" },
        body: buildAxeCode(url, tags),
      },
    );

    if (!res.ok) {
      throw new Error(
        `Browserless /function failed: ${res.status} ${await res.text()}`,
      );
    }

    const payload = (await res.json()) as {
      title?: string;
      url?: string;
      results?: { violations?: AxeRule[]; incomplete?: AxeRule[] };
    };
    const axe = payload.results ?? {};

    return {
      requestedUrl: url,
      auditedTitle: payload.title ?? "",
      auditedUrl: payload.url ?? "",
      standard,
      violations: (axe.violations ?? []).map(mapRule),
      incomplete: (axe.incomplete ?? []).map(mapRule),
    };
  },
});
