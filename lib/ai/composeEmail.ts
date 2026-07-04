import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * In-app cold-email composer. Given a lead's public details and the sector
 * knowledge base (APMG's own service offerings, from Supabase / the repo KB
 * files — see lib/pipeline/sectorStore.ts), Claude drafts one short, grounded
 * outreach email — subject + HTML body — pitching APMG's real property-
 * maintenance services to the recipient's own facility (never lead generation
 * or marketing). Mirrors lib/ai/leadSummary.ts.
 *
 * Model: claude-opus-4-8 by default; override with COMPOSE_MODEL (allow-listed
 * so a typo can't 404 every draft). Returns null when ANTHROPIC_API_KEY is
 * unset or the call fails, so the compose route degrades to its deterministic
 * template (campaign.ts demoDraft).
 *
 * The KB is stable per sector, so it goes in a cache_control system block: when
 * the instructions + KB prefix clears the model's minimum cacheable size, a
 * batch of same-sector leads reuses it at ~0.1x input cost (see the sequential
 * drafting loop in the compose route).
 */

const DEFAULT_MODEL = "claude-opus-4-8";
// Only models that support structured outputs (output_config.format) — an
// unknown COMPOSE_MODEL value falls back to the default rather than 400-ing
// every request. (Opus 4.7 is intentionally excluded: it isn't on the
// structured-outputs support list.)
const ALLOWED_MODELS = new Set([
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5",
]);

function composeModel(): string {
  const m = (process.env.COMPOSE_MODEL ?? "").trim();
  return ALLOWED_MODELS.has(m) ? m : DEFAULT_MODEL;
}

export interface ComposeLeadFacts {
  business: string;
  category?: string | null;
  website?: string | null;
}

export interface DraftedEmail {
  subject: string;
  html: string;
}

// Framing + guardrails live in the KB (business.md "Guardrails for the email
// writer" + each sector file); this pins the job, the hard rules, and the exact
// output shape. Stable text → cacheable prefix.
const INSTRUCTIONS = `You are the outreach copywriter for APMG Services (Australian Property Maintenance Group). Write ONE short, warm B2B cold email that offers APMG's property-maintenance and trade services to the recipient's OWN facility.

Ground every claim in the APMG knowledge base below and follow its "Guardrails for the email writer" exactly. Non-negotiable rules:
- APMG MAINTAINS and REPAIRS the recipient's buildings and grounds. It is NOT a lead-generation, marketing, SEO, or customer-acquisition service. Never imply APMG brings the recipient new customers, families, students, residents, patients, or "more business" — that framing is wrong and must never appear.
- Use ONLY the services, sectors, tone, and facts stated in the knowledge base. Do NOT invent services, statistics, response times, years in business, coverage areas, certifications, client names, prices, or a personal sender name.
- Open by addressing the recipient's specific business, and tie the pitch to its sector (aged care / early childhood / education / etc.) — keeping their site safe, compliant, and well maintained with minimal disruption to the people who rely on it.
- Keep APMG's real tone: practical, trustworthy, genuine care — never salesy growth-hacking language.

Output rules:
- subject: one specific, non-spammy line — no ALL CAPS, no "!!", under ~70 characters.
- Never use ALL-CAPS phrases anywhere (subject or body), even if the knowledge base quotes phrases that way — write in normal sentence case.
- html: plain HTML paragraphs only — no inline styles, images, headings, or lists. Use exactly this structure: one greeting <p> that addresses the recipient's business by name; one or two short body <p> making the sector-relevant maintenance pitch; then the call-to-action as its OWN <p> containing EXACTLY one anchor whose href is the literal token — <a href="{{link}}">…</a> (never write a real URL such as apmgservices.com.au; the sender substitutes the tracked link); then finally the sign-off <p>&mdash; The APMG Services team</p>.`;

// Structured output → the response is guaranteed to be this JSON object.
const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    subject: { type: "string" },
    html: { type: "string" },
  },
  required: ["subject", "html"],
  additionalProperties: false,
};

function leadPrompt(f: ComposeLeadFacts): string {
  const lines = [
    `Business: ${f.business}`,
    f.category ? `Category: ${f.category}` : null,
    f.website ? `Website: ${f.website}` : null,
  ].filter(Boolean);
  return `Draft the outreach email for this lead:\n${lines.join("\n")}`;
}

/**
 * Force every anchor's href to the literal {{link}} token. The email carries a
 * single CTA anchor; if the model ever links a real URL (the KB names
 * apmgservices.com.au) the send route would ship an untracked link and — since
 * ensureLinkToken only looks for the {{link}} substring — append a SECOND CTA
 * below the sign-off. Rewriting the href guarantees exactly one tracked CTA.
 */
function forceTrackedCta(html: string): string {
  return html.replace(/href\s*=\s*("[^"]*"|'[^']*')/gi, 'href="{{link}}"');
}

/**
 * Draft one lead's email. `kb` is the combined general + sector markdown for the
 * lead (from buildComposeKb). Returns the {subject, html} on success, or null on
 * any miss (no API key, API/parse error, empty fields) so the caller can fall
 * back to the deterministic template.
 */
export async function draftEmail(
  facts: ComposeLeadFacts,
  kb: string,
): Promise<DraftedEmail | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const knowledge = kb.trim();

  try {
    // Bound a single hung/slow draft (the compose route runs leads sequentially
    // under a fixed maxDuration); on timeout we degrade to the template.
    const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
    const message = await client.messages.create({
      model: composeModel(),
      max_tokens: 1500,
      // The KB is the stable, cacheable tail of the system prefix; same-sector
      // leads processed back-to-back reuse it (usage.cache_read_input_tokens).
      system: [
        { type: "text", text: INSTRUCTIONS },
        {
          type: "text",
          text: knowledge
            ? `APMG KNOWLEDGE BASE — the only facts you may use:\n\n${knowledge}`
            : "No knowledge base was available. Use only the general APMG facts stated in the instructions above and do not invent specifics.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: leadPrompt(facts) }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    const raw = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const subject = typeof o.subject === "string" ? o.subject.trim() : "";
    const html = typeof o.html === "string" ? o.html.trim() : "";
    if (!subject || !html) return null;

    return { subject, html: forceTrackedCta(html) };
  } catch {
    // No key / network / auth / rate-limit / malformed JSON — degrade to the
    // template. One lead failing never aborts the batch.
    return null;
  }
}
