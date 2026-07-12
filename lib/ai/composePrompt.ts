/**
 * Shared config for the in-app cold-email composer — the single source of truth
 * for the model, system instructions, per-lead message, and output shape that
 * lib/ai/composeEmail.ts uses to draft each email.
 *
 * Kept free of `server-only` (unlike composeEmail.ts) so the read-only
 * "Email Composer" config tab (components/apmg/ComposerConfigPage.tsx) can render
 * the exact prompt Claude is given. The KB that grounds each draft is appended at
 * request time per sector (see lib/pipeline/sectorStore.ts buildComposeKb) and is
 * viewable on the Sector Playbooks tab.
 */

export const DEFAULT_MODEL = "claude-opus-4-8";

// Only models that support structured outputs (output_config.format) — an
// unknown COMPOSE_MODEL value falls back to the default rather than 400-ing
// every request. (Opus 4.7 is intentionally excluded: it isn't on the
// structured-outputs support list.)
export const ALLOWED_MODELS = new Set([
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5",
]);

export function composeModel(): string {
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
export const INSTRUCTIONS = `You are the outreach copywriter for APMG Services (Australian Property Maintenance Group). Write ONE short, warm B2B cold email that offers APMG's property-maintenance and trade services to the recipient's OWN facility.

Ground every claim in the APMG knowledge base below and follow its "Guardrails for the email writer" exactly. Non-negotiable rules:
- APMG MAINTAINS and REPAIRS the recipient's buildings and grounds. It is NOT a lead-generation, marketing, SEO, or customer-acquisition service. Never imply APMG brings the recipient new customers, families, students, residents, patients, or "more business". That framing is wrong and must never appear.
- Use ONLY the services, sectors, tone, and facts stated in the knowledge base. Do NOT invent services, statistics, response times, years in business, coverage areas, certifications, client names, prices, or a personal sender name.
- Open by addressing the recipient's specific business, and tie the pitch to its sector (aged care / early childhood / education / etc.), keeping their site safe, compliant, and well maintained with minimal disruption to the people who rely on it.
- Keep APMG's real tone: practical, trustworthy, genuine care, never salesy growth-hacking language.
- Write in natural Australian English, the way an Australian business actually speaks: Australian spelling (organise, minimise, recognise, prioritise, maintained, licence, centre, colour, favourable) and plain, direct, understated wording. No Americanisms and no US spelling (never "elderly care", "senior care", "specialize", "customize", "gotten", "reach out to touch base"). Use each sector's real Australian terms exactly as the knowledge base does: "aged care" and "retirement living" (never "elderly care"), "early learning" and "childcare centre", "body corporate and strata", "facility management", "make safe works". Sound like a local Melbourne trades partner, professional and genuine, not a generic overseas sales template.

Output rules:
- subject: one specific, non-spammy line with no ALL CAPS, no "!!", under ~70 characters.
- Never use ALL-CAPS phrases anywhere (subject or body), even if the knowledge base quotes phrases that way. Write in normal sentence case.
- Do not use em dashes or en dashes anywhere in the subject or body. Use commas, colons, parentheses, or separate sentences instead.
- html: plain HTML paragraphs only, with no inline styles, images, headings, or lists. Use exactly this structure: one greeting <p> that addresses the recipient's business by name; one or two short body <p> making the sector-relevant maintenance pitch; then the call-to-action as its OWN <p> containing EXACTLY one anchor whose href is the literal token, <a href="{{link}}">…</a> (never write a real URL such as apmgservices.com.au; the sender substitutes the tracked link); then finally the sign-off <p>The APMG Services team</p>.
- CTA anchor label: tailor it to the recipient's sector and keep it SHORT and CRISP, in natural Australian English (three to five words, no trailing arrow, no "click here", no exclamation). Lead with the sector, then a plain maintenance verb the way an Aussie tradie would say it. Shape it like "<Sector> upkeep, sorted" or "<Sector> maintenance, done right" or "Keep your <sector> site sorted". Examples by category: healthcare -> "Healthcare property, sorted"; aged care -> "Aged care upkeep, sorted"; early learning -> "Childcare centre, well maintained"; education -> "Keep your school site sorted"; legal or professional offices -> "Office upkeep, sorted"; body corporate and strata -> "Strata maintenance, sorted". If the category is missing or unclear, use "Your property, well looked after". Never fall back to a generic "See what we do" style label.`;

// Structured output → the response is guaranteed to be this JSON object.
export const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    subject: { type: "string" },
    html: { type: "string" },
  },
  required: ["subject", "html"],
  additionalProperties: false,
};

// The per-lead user message, as an editable template. {{business}} /
// {{category}} / {{website}} are substituted per lead; a line whose only token
// resolves to empty is dropped (so a lead with no category/website doesn't ship
// a blank "Category:" line). Kept as text so it's editable from the DB / UI.
export const DEFAULT_LEAD_TEMPLATE = `Draft the outreach email for this lead:
Business: {{business}}
Category: {{category}}
Website: {{website}}`;

/** Render a lead message from a template + the lead's facts. Substitutes the
 *  {{business}}/{{category}}/{{website}} tokens and drops any line whose only
 *  token(s) resolve to empty (unless it carries {{business}}, which is always
 *  kept). Unknown tokens are left untouched. */
export function renderLeadPrompt(template: string, f: ComposeLeadFacts): string {
  const vals: Record<string, string> = {
    business: (f.business ?? "").trim(),
    category: (f.category ?? "").trim(),
    website: (f.website ?? "").trim(),
  };
  return template
    .split("\n")
    .map((line) => {
      const tokens = [...line.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      const allEmpty =
        tokens.length > 0 && tokens.every((t) => t in vals && !vals[t]);
      if (allEmpty && !tokens.includes("business")) return null;
      let out = line;
      for (const [k, v] of Object.entries(vals)) out = out.replaceAll(`{{${k}}}`, v);
      return out;
    })
    .filter((l): l is string => l !== null)
    .join("\n")
    .trim();
}

export function leadPrompt(f: ComposeLeadFacts): string {
  return renderLeadPrompt(DEFAULT_LEAD_TEMPLATE, f);
}
