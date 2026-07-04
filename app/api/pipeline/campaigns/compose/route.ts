import {
  bestEmail,
  demoDraft,
  ensureLinkToken,
  isEmail,
  MAX_COMPOSE_LEADS,
  MAX_DRAFT_EMAILS,
  safeCampaignTag,
  type ComposeDraft,
  type ComposeLeadInput,
  type DraftEmailSource,
} from "@/lib/pipeline/campaign";
import { composeWebhook, isUuid, sameOrigin, supabaseTarget, webhookAuthHeaders } from "@/lib/pipeline/server";
import { buildComposeKb, loadPlaybooks } from "@/lib/pipeline/sectorStore";

// "Compose email" bridge: hands the selected leads to the n8n compose
// automation (references/Compose Email Automation.json), which extracts up to
// 10 emails per lead (CSV first, contact-us page scrape as the fallback) and
// has Claude draft a per-lead subject + HTML body tailored to the CSV Category.
// Freshly scraped emails are persisted back onto public.leads so the lead is
// emailable from then on. Runs on Node.
//
// Delivery: when N8N_COMPOSE_WEBHOOK_URL is set we POST { campaign, leads } and
// wait for { ok, results }; otherwise drafts are simulated (demo mode),
// mirroring the importer and the send route.
//
// SECURITY — TODO before exposing publicly: same-origin (CSRF) floor only, NOT
// real auth; enforce the `campaigns.send` permission here too once auth lands.
export const runtime = "nodejs";
// n8n drafts leads one at a time (two page fetches + a Claude call each), so the
// run can be slow; give serverless deploys the platform max.
export const maxDuration = 300;

const MAX_SUBJECT = 300;
const MAX_HTML = 20_000;
// Scale the client's patience to the batch size (n8n has no execution cap),
// bounded to the serverless maxDuration so we don't wait past when the function
// would be killed anyway.
function composeTimeoutMs(leadCount: number): number {
  return Math.min(300_000, 45_000 + leadCount * 25_000);
}

type ComposeMode = "live" | "demo" | "noop";

interface ComposeResult {
  ok: boolean;
  mode: ComposeMode;
  campaign?: string;
  results?: ComposeDraft[];
  /** leads whose freshly scraped emails were written back to Supabase */
  saved?: number;
  error?: string;
}

/** Whitelist a client lead → the fields the automation needs. Drops anything
 *  without a stable stored id (the Supabase write-back filters by it). */
function sanitizeLead(input: unknown): ComposeLeadInput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!isUuid(id)) return null;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const emails = Array.isArray(o.emails)
    ? o.emails
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase())
        .filter(isEmail)
        .slice(0, MAX_DRAFT_EMAILS)
    : [];
  return { id, name, website: str(o.website), category: str(o.category), emails };
}

/** Whitelist one draft coming back from n8n. `known` maps lead id → the lead we
 *  sent, so the automation can't attach a draft to a lead we never asked about. */
function sanitizeDraft(input: unknown, known: Map<string, ComposeLeadInput>): ComposeDraft | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const lead = known.get(id);
  if (!lead) return null;

  const emails = Array.isArray(o.emails)
    ? [
        ...new Set(
          o.emails
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim().toLowerCase())
            .filter(isEmail),
        ),
      ].slice(0, MAX_DRAFT_EMAILS)
    : [];

  const rawSource = typeof o.email_source === "string" ? o.email_source : "";
  const email_source: DraftEmailSource =
    rawSource === "csv" || rawSource === "scraped" ? rawSource : "none";

  const rawBest = typeof o.best_email === "string" ? o.best_email.trim().toLowerCase() : "";
  const best_email = emails.includes(rawBest) ? rawBest : bestEmail(emails);

  const subject = (typeof o.subject === "string" ? o.subject.trim() : "").slice(0, MAX_SUBJECT);
  const rawHtml = (typeof o.html === "string" ? o.html.trim() : "").slice(0, MAX_HTML);

  // a draft with no copy at all is useless — fall back to the demo template
  if (!subject || !rawHtml) {
    const fallback = demoDraft(lead);
    return { ...fallback, emails, email_source, best_email };
  }

  return {
    id,
    business: lead.name,
    category: typeof o.category === "string" && o.category.trim() ? o.category.trim() : lead.category ?? null,
    url: lead.website ?? null,
    emails,
    email_source,
    best_email,
    subject,
    html: ensureLinkToken(rawHtml),
  };
}

/** Persist scraped emails back onto public.leads (best-effort — a failed write
 *  never fails the compose). Returns how many leads were updated. */
async function persistScrapedEmails(drafts: ComposeDraft[]): Promise<number> {
  const target = supabaseTarget();
  if (target.state !== "ok") return 0;
  const toSave = drafts.filter((d) => d.email_source === "scraped" && d.emails.length > 0);
  let saved = 0;
  for (const d of toSave) {
    if (!isUuid(d.id)) continue;
    try {
      // return=representation + select=id so a zero-row match (lead deleted
      // mid-compose) doesn't inflate the saved count on a 204.
      const res = await fetch(`${target.base}/rest/v1/leads?id=eq.${d.id}&select=id`, {
        method: "PATCH",
        headers: {
          apikey: target.key,
          Authorization: `Bearer ${target.key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ emails: d.emails }),
      });
      if (res.ok) {
        const rows = (await res.json().catch(() => [])) as unknown[];
        if (Array.isArray(rows) && rows.length > 0) saved++;
      } else {
        console.error(`[pipeline/compose] Supabase PATCH ${res.status} for lead ${d.id}`);
      }
    } catch (e) {
      console.error(`[pipeline/compose] persisting emails for lead ${d.id} failed:`, e);
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

  const campaign = safeCampaignTag(b.campaign);
  if (!campaign) {
    return json({ ok: false, mode: "noop", error: "Invalid campaign tag — use letters, numbers, and dashes." }, 400);
  }

  const rawLeads = b.leads;
  if (!Array.isArray(rawLeads)) {
    return json({ ok: false, mode: "noop", error: "Expected { leads: [...] }." }, 400);
  }
  if (rawLeads.length > MAX_COMPOSE_LEADS) {
    return json(
      { ok: false, mode: "noop", error: `AI drafting works on up to ${MAX_COMPOSE_LEADS} leads per run — deselect some.` },
      413,
    );
  }

  const leads = rawLeads.map(sanitizeLead).filter((l): l is ComposeLeadInput => l !== null);
  if (leads.length === 0) {
    return json({ ok: false, mode: "noop", error: "No valid stored leads to compose for." }, 400);
  }

  const target = await composeWebhook();
  if (target.state === "demo") {
    // Demo mode — no webhook configured. Simulate per-lead drafts so the
    // review UI is fully exercisable before n8n is wired up.
    return json({ ok: true, mode: "demo", campaign, results: leads.map(demoDraft), saved: 0 });
  }

  // Attach each lead's knowledge base (general company file + the file for the
  // sector its Category resolves to) so the automation drafts a grounded,
  // property-maintenance email tailored to the sector — never a generic
  // lead-generation pitch. See lib/pipeline/sectorStore.ts / components/knowledgebase.
  const playbooks = await loadPlaybooks();
  const leadsForN8n = await Promise.all(
    leads.map(async (l) => ({ ...l, kb: await buildComposeKb(l.category, playbooks) })),
  );

  let res: Response;
  try {
    res = await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...webhookAuthHeaders() },
      body: JSON.stringify({ campaign, leads: leadsForN8n }),
      signal: AbortSignal.timeout(composeTimeoutMs(leads.length)),
    });
  } catch (e) {
    console.error("[pipeline/compose] fetch to n8n webhook failed:", e);
    return json({ ok: false, mode: "live", error: "Could not reach the compose automation." }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[pipeline/compose] n8n webhook ${res.status}:`, detail.slice(0, 1000));
    return json({ ok: false, mode: "live", error: "The compose automation rejected the request." }, 502);
  }

  const data = (await res.json().catch(() => null)) as { results?: unknown } | null;
  if (!data || !Array.isArray(data.results)) {
    return json({ ok: false, mode: "live", error: "The compose automation returned an unexpected response." }, 502);
  }

  const known = new Map(leads.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const results: ComposeDraft[] = [];
  for (const raw of data.results) {
    const draft = sanitizeDraft(raw, known);
    if (!draft || seen.has(draft.id)) continue;
    seen.add(draft.id);
    results.push(draft);
  }
  // any lead the automation dropped still gets a reviewable fallback draft
  for (const lead of leads) {
    if (!seen.has(lead.id)) results.push(demoDraft(lead));
  }

  const saved = await persistScrapedEmails(results);
  return json({ ok: true, mode: "live", campaign, results, saved });
}

function json(result: ComposeResult, status = 200): Response {
  return Response.json(result, { status });
}
