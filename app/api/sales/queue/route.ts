import { bestEmail } from "@/lib/pipeline/campaign";
import { isUuid, sameOrigin, supabaseTarget } from "@/lib/pipeline/server";
import { isMissingPortalTable } from "@/lib/portal/server";
import type { SalesQueueResponse, SalesQueueRow } from "@/lib/sales/queue";

// Paginated read of the Sales queue: every stored lead the admin has actually
// emailed, newest send first. The gate is the `email_sent` ledger in
// portal_events (one row per delivered recipient, written by
// /api/pipeline/campaigns/send) — no lead column needed, and pre-existing
// sends are already in the ledger. Pagination is server-side (?page=&pageSize=)
// so the tab stays fast as the queue grows. Server-only (service role key).
export const runtime = "nodejs";

const SENT_EVENT = "email_sent";
// PostgREST caps each response at max-rows (1000 default) — page the ledger
// scan like /api/pipeline/leads does, bounded so a runaway table can't stall.
const EVENT_PAGE = 1000;
const EVENT_LIMIT = 20000;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

const LEAD_COLS = "id,name,address,rating,category,website,phone,emails,engaged,engaged_at";
// engaged/engaged_at arrive with portal-telemetry.sql; degrade without them
const LEAD_COLS_BASE = "id,name,address,rating,category,website,phone,emails";

type Target = { base: string; key: string };

function headers(key: string, extra?: Record<string, string>): HeadersInit {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Display form of a stored website: strip the scheme + trailing slash (the
 *  card links prepend https://). */
function cleanSite(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = s.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return t || null;
}

interface QueueMeta {
  sent: number;
  lastSentAt: string;
  campaign: string | null;
}

/**
 * Scan the email_sent ledger (newest first) into an ordered lead_id → meta map.
 * Insertion order IS the queue order: a lead's first appearance is its most
 * recent send. Returns null when the portal tables are missing (needsMigration).
 */
async function scanSentLedger(target: Target): Promise<Map<string, QueueMeta> | null | "error"> {
  const queue = new Map<string, QueueMeta>();
  let offset = 0;
  while (offset < EVENT_LIMIT) {
    let res: Response;
    try {
      res = await fetch(
        `${target.base}/rest/v1/portal_events?select=lead_id,campaign,created_at&event=eq.${SENT_EVENT}` +
          `&lead_id=not.is.null&order=created_at.desc,id.asc&limit=${EVENT_PAGE}&offset=${offset}`,
        { headers: headers(target.key), cache: "no-store" },
      );
    } catch (e) {
      console.error("[sales/queue] ledger fetch failed:", e);
      return "error";
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (isMissingPortalTable(res.status, detail)) return null;
      console.error(`[sales/queue] ledger ${res.status}:`, detail.slice(0, 500));
      return "error";
    }
    const rows = (await res.json().catch(() => [])) as Array<{
      lead_id?: unknown;
      campaign?: unknown;
      created_at?: unknown;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      const id = typeof r.lead_id === "string" ? r.lead_id : "";
      if (!isUuid(id)) continue;
      const cur = queue.get(id);
      if (cur) {
        cur.sent += 1;
      } else {
        queue.set(id, {
          sent: 1,
          lastSentAt: typeof r.created_at === "string" ? r.created_at : "",
          campaign: str(r.campaign),
        });
      }
    }
    if (rows.length < EVENT_PAGE) break;
    offset += rows.length;
  }
  return queue;
}

/** Tally how many of the queued leads have engaged (clicked the tracked link),
 *  via chunked count=exact HEAD-style reads. Best-effort — 0 on any failure. */
async function countEngaged(target: Target, ids: string[]): Promise<number> {
  const CHUNK = 200;
  let total = 0;
  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const res = await fetch(
        `${target.base}/rest/v1/leads?select=id&engaged=is.true&id=in.(${chunk.join(",")})&limit=1`,
        { headers: headers(target.key, { Prefer: "count=exact" }), cache: "no-store" },
      );
      if (!res.ok) return 0; // engaged column may not exist yet — nice-to-have only
      const range = res.headers.get("content-range") ?? "";
      const n = range.includes("/") ? Number(range.split("/")[1]) : NaN;
      if (Number.isFinite(n)) total += n;
    }
  } catch {
    return 0;
  }
  return total;
}

export async function GET(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return json({ ok: false, error: "Forbidden." }, 403);
  }

  const params = new URL(req.url).searchParams;
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(params.get("pageSize")) || DEFAULT_PAGE_SIZE)),
  );

  const target = supabaseTarget();
  if (target.state === "demo") {
    return json({ ok: true, mode: "demo", page, pageSize });
  }
  if (target.state === "misconfigured") {
    console.error("[sales/queue] SUPABASE_URL is not a valid URL.");
    return json({ ok: false, page, pageSize, error: "The importer is misconfigured." }, 500);
  }

  const queue = await scanSentLedger(target);
  if (queue === "error") {
    return json({ ok: false, page, pageSize, error: "Couldn't read the send ledger." }, 502);
  }
  if (queue === null) {
    // No portal_events table yet → nothing has ever been sent through the app.
    return json({ ok: true, page, pageSize, needsMigration: true });
  }

  const orderedIds = [...queue.keys()];
  const total = orderedIds.length;
  const pageIds = orderedIds.slice((page - 1) * pageSize, page * pageSize);

  const engagedTotal = total > 0 ? await countEngaged(target, orderedIds) : 0;

  if (pageIds.length === 0) {
    return json({ ok: true, total, engagedTotal, page, pageSize });
  }

  // Join the page's ids back to the leads table. Leads deleted/reimported since
  // the send are silently skipped (their ledger rows outlive them by design).
  let cols = LEAD_COLS;
  let res: Response;
  try {
    res = await fetch(
      `${target.base}/rest/v1/leads?select=${cols}&id=in.(${pageIds.join(",")})`,
      { headers: headers(target.key), cache: "no-store" },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (/engaged/i.test(detail)) {
        // pre-portal-telemetry schema — read without the engaged columns
        cols = LEAD_COLS_BASE;
        res = await fetch(
          `${target.base}/rest/v1/leads?select=${cols}&id=in.(${pageIds.join(",")})`,
          { headers: headers(target.key), cache: "no-store" },
        );
      }
    }
  } catch (e) {
    console.error("[sales/queue] leads fetch failed:", e);
    return json({ ok: false, total, engagedTotal, page, pageSize, error: "Could not reach the database." }, 502);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[sales/queue] leads ${res.status}:`, detail.slice(0, 500));
    return json({ ok: false, total, engagedTotal, page, pageSize, error: "Couldn't read the leads table." }, 502);
  }

  const leadRows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of Array.isArray(leadRows) ? leadRows : []) {
    if (typeof r.id === "string") byId.set(r.id, r);
  }

  const rows: SalesQueueRow[] = [];
  for (const id of pageIds) {
    const lead = byId.get(id);
    const meta = queue.get(id);
    if (!lead || !meta) continue;
    const emails = Array.isArray(lead.emails)
      ? lead.emails.filter((e): e is string => typeof e === "string")
      : [];
    rows.push({
      id,
      business: str(lead.name) ?? "Unknown business",
      category: str(lead.category),
      location: str(lead.address),
      website: cleanSite(lead.website),
      phone: str(lead.phone),
      email: bestEmail(emails),
      rating: typeof lead.rating === "number" && Number.isFinite(lead.rating) ? lead.rating : null,
      engaged: lead.engaged === true,
      engagedAt: str(lead.engaged_at),
      lastSentAt: meta.lastSentAt,
      emailsSent: meta.sent,
      campaign: meta.campaign,
    });
  }

  return json({ ok: true, rows, total, engagedTotal, page, pageSize });
}

function json(partial: Partial<SalesQueueResponse> & { ok: boolean }, status = 200): Response {
  const body: SalesQueueResponse = {
    mode: "live",
    rows: [],
    total: 0,
    engagedTotal: 0,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    ...partial,
  };
  return Response.json(body, { status });
}
