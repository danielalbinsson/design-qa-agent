import { defineTool } from "eve/tools";
import { z } from "zod";
import { browserlessFunction } from "../../../lib/browserless";
import { assertPublicHttpUrl } from "../../../lib/url";

// Collects the *rendered* style values on the page (computed styles), so we can
// compare them against design tokens. Runs inside Browserless's browser.

// URL is INLINED into the code (Browserless /function does not pass `context`
// through reliably — relying on it audited Browserless's own runner page).
function buildStylesCode(url: string): string {
  return `export default async function ({ page }) {
    await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 60000 });
    const data = await page.evaluate(() => {
      const colors = new Set(); const fontSizes = new Set();
      const radii = new Set(); const spacing = new Set();
      const els = Array.from(document.querySelectorAll("body *")).slice(0, 4000);
      for (const el of els) {
        const s = getComputedStyle(el);
        if (s.color) colors.add(s.color);
        if (s.backgroundColor && s.backgroundColor !== "rgba(0, 0, 0, 0)") colors.add(s.backgroundColor);
        if (s.fontSize) fontSizes.add(s.fontSize);
        if (s.borderTopLeftRadius && s.borderTopLeftRadius !== "0px") radii.add(s.borderTopLeftRadius);
        for (const p of ["marginTop","marginBottom","paddingTop","paddingBottom","gap"]) {
          const v = s[p]; if (v && v !== "0px" && v !== "normal") spacing.add(v);
        }
      }
      const cap = (set) => Array.from(set).slice(0, 50);
      return { title: document.title, url: location.href,
        colors: cap(colors), fontSizes: cap(fontSizes), radii: cap(radii), spacing: cap(spacing) };
    });
    return { data, type: "application/json" };
  }`;
}

type StylesPayload = {
  title?: string;
  url?: string;
  colors?: string[];
  fontSizes?: string[];
  radii?: string[];
  spacing?: string[];
};

export default defineTool({
  description:
    "Collect the rendered (computed) colors, font sizes, border radii, and spacing values used on a page, for comparison against design tokens. Also returns the audited page's title/url.",
  inputSchema: z.object({
    url: z.string().url(),
  }),
  async execute({ url }) {
    const safeUrl = await assertPublicHttpUrl(url);
    const out = await browserlessFunction<StylesPayload>(buildStylesCode(safeUrl));

    const auditedUrl = out.url ?? "";
    if (!auditedUrl) {
      throw new Error(
        "Browserless styles run returned no audited URL — response may be malformed or the page failed to load",
      );
    }

    return {
      requestedUrl: url,
      auditedTitle: out.title ?? "",
      auditedUrl,
      colors: out.colors ?? [],
      fontSizes: out.fontSizes ?? [],
      radii: out.radii ?? [],
      spacing: out.spacing ?? [],
    };
  },
});
