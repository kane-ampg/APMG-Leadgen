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
<p>APMG Services is a Melbourne-based, multi-trade property maintenance partner — painting, electrical, plumbing, carpentry, flooring, grounds and property make-safe — all through one reliable team.</p>
<p>We keep facilities like yours safe, compliant and well maintained, with minimal disruption to the people who rely on them.</p>
<p><a href="{{link}}">See how APMG can help &rarr;</a></p>
<p>&mdash; The APMG Services team</p>`;

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

/** Render the HTML body, substituting both merge tokens. `business` is escaped
 *  (it lands in HTML); `link` is a URL we built ourselves, inserted verbatim. */
export function renderBody(template: string, vars: { business?: string | null; link: string }): string {
  const business = escapeHtml((vars.business ?? "").trim() || "there");
  return template.split("{{business}}").join(business).split("{{link}}").join(vars.link);
}

/** Render the subject line. Plain text (an email header), so no HTML escaping. */
export function renderSubject(template: string, vars: { business?: string | null }): string {
  const business = (vars.business ?? "").trim() || "there";
  return template.split("{{business}}").join(business);
}

/* ────────────────────────  AI compose (per-lead drafts)  ───────────────────────
 * The "Compose email" action hands the selected leads to the n8n compose
 * automation (references/Compose Email Automation.json): it extracts up to 10
 * emails per lead (CSV first, contact-page scrape as the fallback) and has
 * Claude draft a subject + HTML body tailored to the lead's CSV Category.
 * Drafts keep the {{link}} token — the send route substitutes the tracked URL.
 */

/** Hard cap on leads per compose run — each lead costs up to two page fetches
 *  plus a Claude call, and the webhook responds synchronously. */
export const MAX_COMPOSE_LEADS = 10;

/** Max addresses the automation may attach to one lead. */
export const MAX_DRAFT_EMAILS = 10;

/** A lead as handed to the compose automation. */
export interface ComposeLeadInput {
  id: string;
  name: string;
  website?: string | null;
  category?: string | null;
  emails?: string[] | null;
}

/** Where a draft's addresses came from. */
export type DraftEmailSource = "csv" | "scraped" | "none";

/** One per-lead draft returned by the automation (or simulated in demo mode). */
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

/** Simulated draft used when N8N_COMPOSE_WEBHOOK_URL is unset (demo mode) —
 *  mirrors the shape and rules of the live automation (tailored opening
 *  paragraph, {{link}} CTA, APMG sign-off) so the review UI is exercisable. */
export function demoDraft(lead: ComposeLeadInput): ComposeDraft {
  const emails = (lead.emails ?? []).map((e) => e.trim().toLowerCase()).filter(isEmail).slice(0, MAX_DRAFT_EMAILS);
  const category = (lead.category ?? "").trim() || null;
  const trade = category ? category.replace(/\s*services?\s*$/i, "").trim() || category : "local";
  const business = escapeHtml(lead.name.trim() || "there");
  const html =
    `<p>Hi ${business},</p>` +
    `<p>APMG Services is a Melbourne-based multi-trade property maintenance partner &mdash; painting, electrical, plumbing, carpentry, flooring, grounds and property make-safe &mdash; all handled by one licensed team. ` +
    `We keep ${escapeHtml(trade)} facilities like yours safe, compliant and well maintained, working around your operations so the people who rely on them are never disrupted. ` +
    `Whether it&rsquo;s scheduled upkeep or an urgent repair, you get one reliable partner instead of chasing multiple contractors.</p>` +
    `<p><a href="{{link}}">See how APMG can help &rarr;</a></p>` +
    `<p>&mdash; The APMG Services team</p>`;
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
