// Outreach-campaign template + merge helpers, shared by the Send Campaigns tab
// (client preview) and the send route (server render). Pure and framework-free
// so the SAME render runs in the browser preview and on the server — what the
// admin previews is exactly what is sent.
//
// The copy mirrors the n8n "Send a message" Gmail node in
// references/Leadgen Automation.json: a short HTML email whose CTA links to the
// attribution hook /t/<leadId>?c=<campaign> (see app/t/[id]/route.ts).

/** Default tracking tag (the `?c=` value). Mirrors the n8n outreach campaign. */
export const DEFAULT_CAMPAIGN = "outreach-2026";

/** Default subject line. APMG sells property maintenance TO the recipient — not
 *  lead generation — so the copy pitches trusted, one-partner upkeep. */
export const DEFAULT_SUBJECT = "One trusted partner for your property maintenance";

/**
 * Default HTML body. `{{business}}` and `{{link}}` are the two merge tokens:
 * the recipient's business name and the per-lead tracked CTA URL. Framed as
 * APMG's real offer — multi-trade property maintenance for the recipient's own
 * facility — never a lead-generation / "more customers" pitch.
 */
export const DEFAULT_BODY_HTML = `<p>Hi {{business}},</p>
<p>APMG Services is a Melbourne-based, multi-trade property maintenance partner covering painting, electrical, plumbing, carpentry, flooring, grounds and property make-safe, all through one reliable team.</p>
<p>We keep facilities like yours safe, compliant and well maintained, with minimal disruption to the people who rely on them.</p>
<p><a href="{{link}}">See how APMG can help &rarr;</a></p>
<p>The APMG Services team</p>`;

/** The merge tokens the composer documents to the user. */
export const MERGE_TOKENS = ["{{business}}", "{{link}}"] as const;

/** Hard cap on recipients per send (shared by the client gate + the route). */
export const MAX_RECIPIENTS = 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(v: unknown): v is string {
  return typeof v === "string" && EMAIL_RE.test(v.trim());
}

// Role-based local-parts a human would reach first, best → worst.
const PREFERRED_LOCALPARTS = ["info", "contact", "sales", "hello", "office", "enquiries", "admin", "support"];

/**
 * Pick the single best address to contact a business — prefers a role inbox
 * (info@, contact@, sales@…), skips no-reply addresses, else the first listed.
 * Mirrors the intent of the n8n "best_contact_email" extraction step.
 */
export function bestEmail(emails: readonly string[] | null | undefined): string | null {
  const list = (emails ?? []).map((e) => e.trim()).filter(Boolean);
  if (list.length === 0) return null;
  const usable = list.filter((e) => !/^(no-?reply|donotreply|bounce)@/i.test(e));
  const pool = usable.length ? usable : list;
  for (const p of PREFERRED_LOCALPARTS) {
    const hit = pool.find((e) => e.toLowerCase().startsWith(`${p}@`));
    if (hit) return hit;
  }
  return pool[0];
}

/** Validate a campaign tag used in the `?c=` tracking param and PostgREST-safe. */
export function safeCampaignTag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^[\w-]{1,60}$/.test(t) ? t : null;
}

/** Coerce free text into a valid campaign tag (lowercase, dashed). */
export function slugifyCampaign(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Per-lead tracked CTA URL: <base>/t/<leadId>?c=<campaign>. */
export function trackedLink(base: string, leadId: string, campaign: string): string {
  const root = base.replace(/\/+$/, "");
  return `${root}/t/${encodeURIComponent(leadId)}?c=${encodeURIComponent(campaign)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Guarantee no em/en dash reaches an outgoing email, whatever the source (AI
 * draft, shared template, or the deterministic fallback — the model can ignore
 * the "no em dashes" instruction, and old stored drafts predate it). Handles the
 * literal characters and their HTML entities. Because it runs at the shared
 * render choke point, the browser preview and the sent email stay identical.
 *   · a dash opening a paragraph/line (e.g. a "— Sign-off") is dropped
 *   · any other dash (spaced parenthetical or tight) becomes a comma
 * Regular hyphens ("-", e.g. "multi-trade") are left untouched.
 */
export function stripDashes(s: string): string {
  return s
    .replace(/&mdash;|&ndash;|&#8212;|&#8211;|&#x201[34];/gi, "—")
    .replace(/(^|>)\s*[–—―]+\s*/g, "$1")
    .replace(/\s*[–—―]+\s*/g, ", ");
}

/** Render the HTML body, substituting both merge tokens. `business` is escaped
 *  (it lands in HTML); `link` is a URL we built ourselves, inserted verbatim. */
export function renderBody(template: string, vars: { business?: string | null; link: string }): string {
  const business = escapeHtml((vars.business ?? "").trim() || "there");
  const html = template.split("{{business}}").join(business).split("{{link}}").join(vars.link);
  return stripDashes(html);
}

/** Render the subject line. Plain text (an email header), so no HTML escaping. */
export function renderSubject(template: string, vars: { business?: string | null }): string {
  const business = (vars.business ?? "").trim() || "there";
  return stripDashes(template.split("{{business}}").join(business));
}

/**
 * Flatten a rendered HTML body to plain text for the send webhook, so the n8n
 * Gmail node owns all formatting. Anchors keep BOTH their label and href as
 * `label (url)` — the tracked /t/<lead> link is content, not styling, and
 * attribution breaks without it. Block tags become line breaks and the entities
 * our copy uses are decoded to real characters.
 */
export function htmlToText(html: string): string {
  return html
    // links → "label (url)"; the tracked URL must survive into the text
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>(.*?)<\/a>/gis, "$2 ($1)")
    // block-level tags → line breaks
    .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // drop any remaining tags
    .replace(/<[^>]+>/g, "")
    // decode the entities our templates / AI drafts use (&amp; last)
    .replace(/&nbsp;/gi, " ")
    .replace(/&rarr;/gi, "→")
    .replace(/&rsquo;|&#8217;|&#x2019;/gi, "’")
    .replace(/&lsquo;|&#8216;|&#x2018;/gi, "‘")
    .replace(/&rdquo;|&#8221;|&#x201d;/gi, "”")
    .replace(/&ldquo;|&#8220;|&#x201c;/gi, "“")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    // tidy whitespace: no trailing spaces, collapse blank-line runs
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ────────────────────────  AI compose (per-lead drafts)  ───────────────────────
 * The "Compose email" action drafts a per-lead subject + HTML body in-app with
 * the Claude API (lib/ai/composeEmail.ts, via app/api/pipeline/campaigns/compose),
 * grounded in the sector knowledge base for the lead's CSV Category. Addresses
 * come from the lead's stored emails. Drafts keep the {{link}} token — the send
 * route substitutes the tracked URL per recipient.
 */

/** Hard cap on leads per compose run — each lead costs one Claude call and the
 *  route drafts them sequentially, responding synchronously. */
export const MAX_COMPOSE_LEADS = 10;

/** Max stored addresses shown for one lead in the review UI. */
export const MAX_DRAFT_EMAILS = 10;

/** A lead as handed to the composer. */
export interface ComposeLeadInput {
  id: string;
  name: string;
  website?: string | null;
  category?: string | null;
  emails?: string[] | null;
}

/** Where a draft's addresses came from. */
export type DraftEmailSource = "csv" | "scraped" | "none";

/** One per-lead draft (Claude-written, or the deterministic template fallback). */
export interface ComposeDraft {
  id: string;
  business: string;
  category: string | null;
  url: string | null;
  emails: string[];
  email_source: DraftEmailSource;
  best_email: string | null;
  subject: string;
  html: string;
}

/** Guarantee the draft body carries the {{link}} CTA token the send route
 *  rewrites per lead — without it the click is untracked and Sales never
 *  sees the engagement. */
export function ensureLinkToken(html: string): string {
  if (html.includes("{{link}}")) return html;
  return `${html}\n<p><a href="{{link}}">See how it works &rarr;</a></p>`;
}

/** Map a raw CSV Category to the sector wording APMG actually uses in Australian
 *  copy, lowercased so it sits naturally mid-sentence ("aged care facilities",
 *  not "Elderly Care facilities"). Keeps the deterministic template from echoing
 *  awkward or non-Australian scraper labels verbatim. First match wins. */
const SECTOR_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/retirement/i, "retirement living"],
  [/elderly|senior|nursing\s*home|\baged\b/i, "aged care"],
  [/child\s*care|day\s*care|early\s*learning|kindergarten|kinder|pre-?school|childcare/i, "early learning"],
  [/school|education|college|university/i, "education"],
  [/strata|body\s*corporate|owners\s*corp/i, "body corporate and strata"],
  [/medical|health|clinic|dental|hospital|aged\s*care\s*nursing/i, "healthcare"],
  [/warehouse|industrial|factory|logistics|manufactur/i, "industrial"],
  [/retail|shopping|store/i, "retail"],
  [/hospitality|hotel|motel|restaurant|cafe|venue/i, "hospitality"],
];

/** Resolve the sector phrase used in the template's "We keep ___ facilities"
 *  line: an APMG-preferred Australian term when the category matches an alias,
 *  otherwise the raw category (lowercased, trailing "services" stripped), or a
 *  neutral fallback when there's no category. */
function sectorPhrase(category: string | null): string {
  const c = (category ?? "").trim();
  if (!c) return "commercial and residential";
  for (const [re, phrase] of SECTOR_ALIASES) if (re.test(c)) return phrase;
  return c.replace(/\s*services?\s*$/i, "").trim().toLowerCase() || "commercial and residential";
}

/** Deterministic per-lead draft used as the fallback (no ANTHROPIC_API_KEY, or
 *  a Claude miss) and as the base the composer overrides — mirrors the composer's
 *  shape and rules (tailored opening paragraph, {{link}} CTA, APMG sign-off) so
 *  the review UI is always exercisable. */
export function demoDraft(lead: ComposeLeadInput): ComposeDraft {
  const emails = (lead.emails ?? []).map((e) => e.trim().toLowerCase()).filter(isEmail).slice(0, MAX_DRAFT_EMAILS);
  const category = (lead.category ?? "").trim() || null;
  const trade = sectorPhrase(category);
  const business = escapeHtml(lead.name.trim() || "there");
  const html =
    `<p>Hi ${business},</p>` +
    `<p>APMG Services is a Melbourne-based multi-trade property maintenance partner covering painting, electrical, plumbing, carpentry, flooring, grounds and property make-safe, all handled by one licensed team. ` +
    `We keep ${escapeHtml(trade)} facilities like yours safe, compliant and well maintained, working around your operations so the people who rely on them are never disrupted. ` +
    `Whether it&rsquo;s scheduled upkeep or an urgent repair, you get one reliable partner instead of chasing multiple contractors.</p>` +
    `<p><a href="{{link}}">See how APMG can help &rarr;</a></p>` +
    `<p>The APMG Services team</p>`;
  return {
    id: lead.id,
    business: lead.name,
    category,
    url: lead.website ?? null,
    emails,
    email_source: emails.length ? "csv" : "none",
    best_email: bestEmail(emails),
    subject: `Property maintenance & trades for ${lead.name}`.slice(0, 120),
    html,
  };
}
