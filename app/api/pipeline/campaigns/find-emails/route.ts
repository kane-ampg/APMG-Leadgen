import { bestEmail, isEmail, MAX_DRAFT_EMAILS, MAX_FIND_LEADS } from "@/lib/pipeline/campaign";
import {
  emailFinderWebhook,
  isUuid,
  sameOrigin,
  supabaseTarget,
  webhookAuthHeaders,
} from "@/lib/pipeline/server";

// "Find emails": scrapes contact addresses for stored leads that came off the
// CSV import with a website but no email. The selected leads are POSTed to the
// n8n Email Finder workflow (references/APMG Email Finder.json), which fetches
// each lead's site + contact page and answers with the best address it found.
// Found addresses are persisted onto the lead row (the same `emails` column the
// CSV import fills) and returned to the client, which mirrors them into the
// audience table — so the lead becomes sendable without a re-fetch.
//
// Webhook payload:  { leads: [{ id, website }] }  (≤ MAX_FIND_LEADS)
// Webhook response: { ok, results: [{ id, website, emails, best_email }] }
//
// SECURITY — TODO before exposing publicly: like the other pipeline routes this
// has only a same-origin (CSRF) floor, NOT real auth. The UI gates the action
// behind the `campaigns.send` permission; enforce it here too once auth lands.
export const runtime = "nodejs";
// The finder fetches two pages per lead sequentially in n8n; a full batch can
// take minutes — give serverless deploys the platform max.
export const maxDuration = 300;

type FindMode = "live" | "demo" | "noop";

/** One lead's outcome, as returned to the client. `emails` empty = the site
 *  was scraped but yielded nothing usable. */
interface FindResult {
  id: string;
  emails: string[];
  best_email: string | null;
}

interface FindResponse {
  ok: boolean;
  mode: FindMode;
  results?: FindResult[];
  /** leads that came back with at least one address */
  found?: number;
  /** leads whose addresses were persisted onto their Supabase row */
  saved?: number;
  error?: string;
}

/** Whitelist a client lead → { id, website }. Only public http(s) websites
 *  survive (the n8n workflow re-checks with its own SSRF guard; rejecting the
 *  obvious junk here keeps dead leads out of the batch cap). */
function sanitizeLead(input: unknown): { id: string; website: string } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!isUuid(id)) return null;
  let site = typeof o.website === "string" ? o.website.trim() : "";
  if (!site) return null;
  if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
  try {
    const u = new URL(site);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return { id, website: u.toString() };
  } catch {
    return null;
  }
}

/** Coerce one webhook result → FindResult, or null. Only ids we actually asked
 *  about are accepted, and every address is re-validated — the automation's
 *  output is remote input, not trusted data. */
function sanitizeResult(input: unknown, requested: Set<string>): FindResult | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!requested.has(id)) return null;
  const emails = Array.isArray(o.emails)
    ? o.emails
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase())
        .filter(isEmail)
        .filter((x, i, a) => a.indexOf(x) === i)
        .slice(0, MAX_DRAFT_EMAILS)
    : [];
  const claimed = typeof o.best_email === "string" ? o.best_email.trim().toLowerCase() : "";
  // the claimed best must be one of the validated addresses; else re-derive
  const best = emails.includes(claimed) ? claimed : bestEmail(emails);
  return { id, emails, best_email: best };
}

/** Persist found addresses onto their lead rows (same `emails` column the CSV
 *  import fills). Best-effort per lead — a failed PATCH is logged and the
 *  address still reaches the client for this session. */
async function persistFoundEmails(results: FindResult[]): Promise<number> {
  const target = supabaseTarget();
  if (target.state !== "ok") return 0;
  let saved = 0;
  for (const r of results) {
    if (r.emails.length === 0) continue;
    try {
      // return=representation + select=id so a zero-row match (lead deleted
      // mid-run) doesn't inflate the saved count on a 204.
      const res = await fetch(`${target.base}/rest/v1/leads?id=eq.${r.id}&select=id`, {
        method: "PATCH",
        headers: {
          apikey: target.key,
          Authorization: `Bearer ${target.key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ emails: r.emails }),
      });
      if (res.ok) {
        const rows = (await res.json().catch(() => [])) as unknown[];
        if (Array.isArray(rows) && rows.length > 0) saved++;
      } else {
        console.error(`[pipeline/find-emails] Supabase PATCH ${res.status} for lead ${r.id}`);
      }
    } catch (e) {
      console.error(`[pipeline/find-emails] persisting emails for lead ${r.id} failed:`, e);
    }
  }
  return saved;
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return json({ ok: false, mode: "noop", error: "Forbidden." }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, mode: "noop", error: "Invalid JSON body." }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const rawLeads = b.leads;
  if (!Array.isArray(rawLeads)) {
    return json({ ok: false, mode: "noop", error: "Expected { leads: [...] }." }, 400);
  }
  if (rawLeads.length > MAX_FIND_LEADS) {
    return json(
      { ok: false, mode: "noop", error: `Email finding works on up to ${MAX_FIND_LEADS} leads per run — deselect some.` },
      413,
    );
  }

  // sanitize + dedupe by id
  const seen = new Set<string>();
  const leads: Array<{ id: string; website: string }> = [];
  for (const raw of rawLeads) {
    const clean = sanitizeLead(raw);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    leads.push(clean);
  }
  if (leads.length === 0) {
    return json({ ok: false, mode: "noop", error: "No leads with a usable website to scan." }, 400);
  }

  const target = await emailFinderWebhook();
  if (target.state === "demo") {
    // No finder webhook configured (or toggled off). Unlike the send flow we do
    // NOT simulate success — inventing addresses would poison stored leads.
    return json({ ok: true, mode: "demo", results: [], found: 0, saved: 0 });
  }

  let res: Response;
  try {
    res = await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...webhookAuthHeaders() },
      body: JSON.stringify({ leads }),
      // two page-fetches per lead, sequential in n8n — allow a slow batch
      signal: AbortSignal.timeout(240_000),
    });
  } catch (e) {
    console.error("[pipeline/find-emails] fetch to n8n webhook failed:", e);
    return json({ ok: false, mode: "live", error: "Could not reach the email finder automation." }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[pipeline/find-emails] n8n webhook ${res.status}:`, detail.slice(0, 1000));
    return json({ ok: false, mode: "live", error: "The email finder automation rejected the run." }, 502);
  }

  const data = (await res.json().catch(() => null)) as { results?: unknown } | null;
  const rawResults = Array.isArray(data?.results) ? data.results : [];
  const results = rawResults
    .map((r) => sanitizeResult(r, seen))
    .filter((r): r is FindResult => r !== null);

  const found = results.filter((r) => r.emails.length > 0).length;
  const saved = await persistFoundEmails(results);
  return json({ ok: true, mode: "live", results, found, saved });
}

function json(result: FindResponse, status = 200): Response {
  return Response.json(result, { status });
}
