import { defineTool } from "eve/tools";
import { z } from "zod";
import { browserlessFunction } from "../../../lib/browserless";

// Capture screenshot + interaction geometry in one Browserless session, then
// critique with a vision model. Target-size findings are *measured* from the
// DOM; vision is reserved for hierarchy / grouping / alt-text judgment.
// eve tool results are text/json — the vision call must live here.
const VISION_MODEL = process.env.VISION_MODEL ?? "anthropic/claude-sonnet-4.6";
const MIN_TARGET_PX = 24;

type Focusable = {
  index: number;
  tag: string;
  role: string;
  label: string;
  w: number;
  h: number;
  x: number;
  y: number;
  tabindex: number;
};

type CapturePayload = {
  title?: string;
  url?: string;
  screenshotBase64?: string;
  interaction?: { focusables?: Focusable[]; count?: number };
};

function buildCaptureCode(url: string): string {
  return `export default async function ({ page }) {
    await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 60000 });
    const screenshotBase64 = await page.screenshot({
      encoding: "base64",
      fullPage: true,
      type: "png",
    });
    const interaction = await page.evaluate(() => {
      const sel =
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
      const els = Array.from(document.querySelectorAll(sel));
      const focusables = [];
      for (const el of els) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) continue;
        const raw =
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          (el.innerText || "").trim() ||
          el.getAttribute("placeholder") ||
          el.getAttribute("name") ||
          el.tagName;
        const label = String(raw).replace(/\\s+/g, " ").trim().slice(0, 80);
        focusables.push({
          index: focusables.length,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          label,
          w: Math.round(r.width),
          h: Math.round(r.height),
          x: Math.round(r.x),
          y: Math.round(r.y),
          tabindex: el.tabIndex,
        });
      }
      return { focusables: focusables.slice(0, 80), count: focusables.length };
    });
    return {
      data: {
        title: await page.title(),
        url: page.url(),
        screenshotBase64,
        interaction,
      },
      type: "application/json",
    };
  }`;
}

function formatFocusables(focusables: Focusable[]): string {
  if (focusables.length === 0) return "(no focusable elements detected)";
  return focusables
    .map(
      (f) =>
        `${f.index}. <${f.tag}${f.role ? ` role=${f.role}` : ""}> "${f.label || "(no label)"}" ${f.w}×${f.h}px @(${f.x},${f.y}) tabindex=${f.tabindex}`,
    )
    .join("\n");
}

function measuredTargetFindings(focusables: Focusable[]) {
  return focusables
    .filter((f) => f.w < MIN_TARGET_PX || f.h < MIN_TARGET_PX)
    .slice(0, 15)
    .map((f) => ({
      title: `Target below ${MIN_TARGET_PX}×${MIN_TARGET_PX}px`,
      region: `${f.tag}${f.label ? `: "${f.label}"` : ""} (${f.w}×${f.h}px)`,
      impact: "serious" as const,
      wcag: "2.5.8",
      recommendation: `Enlarge the hit area to at least ${MIN_TARGET_PX}×${MIN_TARGET_PX} CSS px (measured ${f.w}×${f.h}).`,
      source: "measured" as const,
    }));
}

function buildRubric(focusableText: string, axeContext?: string): string {
  const axeBlock = axeContext?.trim()
    ? `\nAxe findings already reported by a11y-auditor (do NOT re-report; you may prioritize around them):\n${axeContext.trim().slice(0, 2500)}\n`
    : "";

  return `You are a senior UX reviewer. Critique this screenshot for judgment items automation misses.
Measured tab-order / geometry is provided below — use it as ground truth for focus order and target size.
Do NOT invent target-size failures (those are measured separately). Do NOT invent element names absent from the screenshot or the focusable list.
Focus on: visual hierarchy, grouping/proximity, findability of primary actions, alt-text/label quality cues, focus visibility, Nielsen heuristics where visibly relevant.
${axeBlock}
Focusable elements in approximate tab order (index, tag, label, size):
${focusableText}

Return ONLY a JSON array. Each item: {"title","region","impact":"critical|serious|moderate|minor","wcag"(optional),"recommendation"}. No prose.`;
}

export default defineTool({
  description:
    "Capture a full-page screenshot plus measured focusable geometry for a URL, then critique UX with a vision model. Returns measured target-size findings and vision judgment items. Optional axeContext avoids re-reporting a11y-auditor issues.",
  inputSchema: z.object({
    url: z.string().url(),
    axeContext: z
      .string()
      .optional()
      .describe(
        "Condensed a11y-auditor findings (titles/selectors). Passed through so vision does not re-report them.",
      ),
  }),
  async execute({ url, axeContext }) {
    const capture = await browserlessFunction<CapturePayload>(
      buildCaptureCode(url),
    );

    const auditedUrl = capture.url ?? "";
    if (!auditedUrl || !capture.screenshotBase64) {
      throw new Error(
        "Browserless capture returned no audited URL or screenshot — response may be malformed or the page failed to load",
      );
    }

    const focusables = capture.interaction?.focusables ?? [];
    const measured = measuredTargetFindings(focusables);
    const focusableText = formatFocusables(focusables);

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
              { type: "text", text: buildRubric(focusableText, axeContext) },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${capture.screenshotBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(
        `OpenRouter vision call failed: ${res.status} ${await res.text()}`,
      );
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "[]";

    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let items: unknown = [];
    try {
      items = JSON.parse(cleaned);
    } catch {
      items = [
        {
          title: "Vision output was not valid JSON",
          region: "n/a",
          impact: "minor",
          recommendation: raw.slice(0, 400),
        },
      ];
    }

    return {
      requestedUrl: url,
      auditedTitle: capture.title ?? "",
      auditedUrl,
      focusableCount: capture.interaction?.count ?? focusables.length,
      focusables,
      measuredFindings: measured,
      items,
    };
  },
});
