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

/** Default subject line, lifted verbatim from the n8n outreach email. */
export const DEFAULT_SUBJECT = "A quick idea to bring you more customers";

/**
 * Default HTML body. `{{business}}` and `{{link}}` are the two merge tokens:
 * the recipient's business name and the per-lead tracked CTA URL.
 */
export const DEFAULT_BODY_HTML = `<p>Hi {{business}},</p>
<p>We help businesses like yours get a steady stream of qualified, ready-to-buy customers — without the busywork.</p>
<p><a href="{{link}}">See how it works &rarr;</a></p>
<p>Not interested? No problem — just ignore this email.</p>
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
