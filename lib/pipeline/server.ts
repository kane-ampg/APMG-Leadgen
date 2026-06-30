// Server-only helpers shared by the Pipeline API routes.

/** CSRF floor: reject cross-origin browser writes/reads. NOT a substitute for
 *  real auth — the routes use the RLS-bypassing service role (see route files). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin requests / non-browser callers may omit it
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Resolve the Supabase REST base + service key, or null when unset (demo mode).
 *  Returns "misconfigured" when a value is present but unusable. */
export function supabaseTarget():
  | { state: "demo" }
  | { state: "misconfigured" }
  | { state: "ok"; base: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { state: "demo" };
  try {
    return { state: "ok", base: new URL(url).origin, key };
  } catch {
    return { state: "misconfigured" };
  }
}

/** Resolve the n8n campaign-send webhook, or null when unset (demo mode).
 *  When set, the Send Campaigns tab POSTs rendered outreach messages here for
 *  the automation to deliver; when unset the send is simulated (demo mode),
 *  mirroring supabaseTarget()'s demo behaviour. */
export function campaignWebhook(): { state: "demo" } | { state: "ok"; url: string } {
  const url = process.env.N8N_CAMPAIGN_WEBHOOK_URL;
  if (!url) return { state: "demo" };
  try {
    new URL(url);
    return { state: "ok", url };
  } catch {
    console.error("[pipeline/campaigns] N8N_CAMPAIGN_WEBHOOK_URL is not a valid URL — falling back to demo.");
    return { state: "demo" };
  }
}

/** Sentinel for the null/no-batch folder, used in query params + filters. */
export const UNGROUPED = "__ungrouped__";

/** Validate a batch ("folder") name. Allows leads-0001-… and similar; rejects
 *  anything that could break out of a PostgREST filter value. */
export function safeBatchName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^[\w.-]{1,80}$/.test(t) ? t : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** True when a PostgREST error body indicates the `batch` column is missing
 *  (i.e. the folders migration hasn't been run yet). */
export function isMissingBatchColumn(detail: string): boolean {
  return /batch/i.test(detail) && /(does not exist|could not find|PGRST204)/i.test(detail);
}
