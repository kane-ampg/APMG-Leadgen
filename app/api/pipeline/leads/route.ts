import {
  isMissingBatchColumn,
  isUuid,
  safeBatchName,
  sameOrigin,
  supabaseTarget,
  UNGROUPED,
} from "@/lib/pipeline/server";

// Reads back (GET) and deletes (DELETE) stored leads for the Pipeline view.
// Server-side (keeps the service role key off the browser).
export const runtime = "nodejs";

const TABLE = "leads";
const LIMIT = 2000;
// the flat listing doesn't need `batch`; folder-aware reads add it on
const COLS_BASE =
  "id,name,address,featured_image,bing_maps_url,rating,website,phone,emails,social_medias,facebook,instagram,twitter,created_at";
const COLS = `${COLS_BASE},batch`;

type Target = { base: string; key: string };

/** Build a PostgREST filter for a batch ("folder") query param, or null. */
function batchFilter(value: string | null): string | null {
  if (!value) return null;
  if (value === UNGROUPED) return "batch=is.null";
  const safe = safeBatchName(value);
  return safe ? `batch=eq.${encodeURIComponent(safe)}` : null;
}

function fetchLeads(target: Target, cols: string, filter: string | null): Promise<Response> {
  const url =
    `${target.base}/rest/v1/${TABLE}?select=${cols}&order=created_at.desc&limit=${LIMIT}` +
    (filter ? `&${filter}` : "");
  return fetch(url, {
    headers: { apikey: target.key, Authorization: `Bearer ${target.key}`, Prefer: "count=exact" },
    cache: "no-store",
  });
}

export async function GET(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return Response.json({ ok: false, mode: "live", rows: [], total: 0, error: "Forbidden." }, { status: 403 });
  }

  const target = supabaseTarget();
  if (target.state === "demo") {
    return Response.json({ ok: true, mode: "demo", rows: [], total: 0 });
  }
  if (target.state === "misconfigured") {
    console.error("[pipeline/leads] SUPABASE_URL is not a valid URL.");
    return Response.json({ ok: false, mode: "live", rows: [], total: 0, error: "Importer is misconfigured." }, { status: 500 });
  }

  const filter = batchFilter(new URL(req.url).searchParams.get("batch"));

  let res: Response;
  try {
    res = await fetchLeads(target, COLS, filter);
  } catch (e) {
    console.error("[pipeline/leads] fetch to Supabase failed:", e);
    return Response.json({ ok: false, mode: "live", rows: [], total: 0, error: "Could not reach the database." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[pipeline/leads] Supabase ${res.status}:`, detail.slice(0, 1000));

    if (isMissingBatchColumn(detail)) {
      // A folder-filtered read genuinely needs the column → prompt the migration.
      if (filter) {
        return Response.json({ ok: false, mode: "live", rows: [], total: 0, needsMigration: true, error: "Folders need a one-time migration." }, { status: 422 });
      }
      // The flat listing doesn't need `batch` — degrade and retry without it.
      try {
        res = await fetchLeads(target, COLS_BASE, null);
      } catch (e) {
        console.error("[pipeline/leads] degraded fetch failed:", e);
        return Response.json({ ok: false, mode: "live", rows: [], total: 0, error: "Could not reach the database." }, { status: 502 });
      }
      if (!res.ok) {
        console.error(`[pipeline/leads] degraded ${res.status}:`, (await res.text().catch(() => "")).slice(0, 500));
        return Response.json({ ok: false, mode: "live", rows: [], total: 0, error: "Couldn't read the leads table." }, { status: 502 });
      }
      // fall through to the success path with the degraded response
    } else {
      const missingTable = res.status === 404 || /find the table|PGRST205/i.test(detail);
      return Response.json(
        {
          ok: false,
          mode: "live",
          rows: [],
          total: 0,
          error: missingTable
            ? "The leads table doesn't exist yet — run supabase/schema.sql in Supabase."
            : "Couldn't read the leads table.",
        },
        { status: 502 },
      );
    }
  }

  const rows = await res.json().catch(() => []);
  const range = res.headers.get("content-range") ?? "";
  const fromHeader = range.includes("/") ? Number(range.split("/")[1]) : NaN;
  const total = Number.isFinite(fromHeader) ? fromHeader : Array.isArray(rows) ? rows.length : 0;

  return Response.json({ ok: true, mode: "live", rows: Array.isArray(rows) ? rows : [], total });
}

export async function DELETE(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return Response.json({ ok: false, deleted: 0, mode: "live", error: "Forbidden." }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const idsParam = params.get("ids");
  const batchParam = params.get("batch");

  // Build EXACTLY one filter. Never issue an unfiltered DELETE (would wipe the table).
  let filter: string;
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0 || !ids.every(isUuid)) {
      return Response.json({ ok: false, deleted: 0, mode: "live", error: "Invalid row ids." }, { status: 400 });
    }
    filter = `id=in.(${ids.join(",")})`;
  } else {
    const bf = batchFilter(batchParam);
    if (!bf) {
      return Response.json({ ok: false, deleted: 0, mode: "live", error: "Nothing selected to delete." }, { status: 400 });
    }
    filter = bf;
  }

  const target = supabaseTarget();
  if (target.state === "demo") {
    return Response.json({ ok: true, deleted: 0, mode: "demo" });
  }
  if (target.state === "misconfigured") {
    console.error("[pipeline/leads] SUPABASE_URL is not a valid URL.");
    return Response.json({ ok: false, deleted: 0, mode: "live", error: "Importer is misconfigured." }, { status: 500 });
  }

  let res: Response;
  try {
    res = await fetch(`${target.base}/rest/v1/${TABLE}?${filter}&select=id`, {
      method: "DELETE",
      headers: {
        apikey: target.key,
        Authorization: `Bearer ${target.key}`,
        Prefer: "return=representation",
      },
    });
  } catch (e) {
    console.error("[pipeline/leads] delete fetch failed:", e);
    return Response.json({ ok: false, deleted: 0, mode: "live", error: "Could not reach the database." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[pipeline/leads] Supabase DELETE ${res.status}:`, detail.slice(0, 1000));
    if (isMissingBatchColumn(detail)) {
      return Response.json({ ok: false, deleted: 0, mode: "live", needsMigration: true, error: "Folders need a one-time migration." }, { status: 422 });
    }
    return Response.json({ ok: false, deleted: 0, mode: "live", error: "The database rejected the delete." }, { status: 502 });
  }

  const deletedRows = await res.json().catch(() => []);
  const deleted = Array.isArray(deletedRows) ? deletedRows.length : 0;
  return Response.json({ ok: true, deleted, mode: "live" });
}
