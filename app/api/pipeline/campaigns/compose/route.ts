import {
  demoDraft,
  ensureLinkToken,
  isEmail,
  MAX_COMPOSE_LEADS,
  MAX_DRAFT_EMAILS,
  safeCampaignTag,
  type ComposeDraft,
  type ComposeLeadInput,
} from "@/lib/pipeline/campaign";
import { isUuid, sameOrigin } from "@/lib/pipeline/server";
import { buildComposeKb, loadPlaybooks } from "@/lib/pipeline/sectorStore";
import { draftEmail } from "@/lib/ai/composeEmail";
import { loadComposePrompt, type ComposePromptConfig } from "@/lib/ai/composeStore";

// "Compose email": drafts a per-lead cold email in-app with the Claude API
// (lib/ai/composeEmail.ts), grounded in the sector knowledge base for the
// lead's CSV Category (general company file + the matched sector markdown; see
// lib/pipeline/sectorStore.ts). The CTA keeps the literal {{link}} token — the
// send route substitutes the tracked /t/<lead>?c= URL per recipient. Recipients
// come from the lead's stored (CSV) addresses; a lead can be hand-addressed in
// the review UI. Runs on Node.
//
// Delivery: with ANTHROPIC_API_KEY set, each lead is drafted live by Claude and
// falls back to the deterministic template (campaign.ts demoDraft) on any miss;
// with no key we return the template for every lead (demo mode) so the review
// UI is fully exercisable.
//
// SECURITY — TODO before exposing publicly: same-origin (CSRF) floor only, NOT
// real auth; enforce the `campaigns.send` permission here too once auth lands.
export const runtime = "nodejs";
// Leads are drafted sequentially (one Claude call each) so a large batch can be
// slow; give serverless deploys the platform max.
export const maxDuration = 300;

const MAX_SUBJECT = 300;
const MAX_HTML = 20_000;

type ComposeMode = "live" | "demo" | "noop";

interface ComposeResult {
  ok: boolean;
  mode: ComposeMode;
  campaign?: string;
  results?: ComposeDraft[];
  /** how many leads Claude actually drafted (the rest are template fallbacks). */
  drafted?: number;
  /** retained for the client contract; always 0 now that we no longer scrape. */
  saved?: number;
  error?: string;
}

/** Whitelist a client lead → the fields the composer needs. Drops anything
 *  without a stable stored id and a name. */
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

/** Build a lead's reviewable draft: the deterministic template supplies the
 *  address fields (emails / email_source / best_email) and the fallback copy;
 *  a successful Claude draft overrides the subject + HTML. The CTA {{link}}
 *  token is guaranteed either way. */
async function draftForLead(
  lead: ComposeLeadInput,
  kb: string,
  promptCfg: ComposePromptConfig,
): Promise<{ draft: ComposeDraft; ai: boolean }> {
  const base = demoDraft(lead);
  const drafted = await draftEmail(
    { business: lead.name, category: lead.category, website: lead.website },
    kb,
    promptCfg,
  );
  if (!drafted) return { draft: base, ai: false };
  const subject = drafted.subject.slice(0, MAX_SUBJECT);
  const html = drafted.html.slice(0, MAX_HTML);
  if (!subject || !html) return { draft: base, ai: false };
  return { draft: { ...base, subject, html: ensureLinkToken(html) }, ai: true };
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

  // No API key → deterministic template for every lead (demo mode). Still fully
  // reviewable and sendable; just not AI-written.
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ ok: true, mode: "demo", campaign, results: leads.map(demoDraft), saved: 0 });
  }

  // Ground each draft in the sector KB for its Category (general company file +
  // the matched sector markdown; uploaded KB in Supabase wins over the repo
  // file). Draft sequentially so a batch of same-sector leads reuses the cached
  // KB system prefix instead of paying a cold cache write per lead.
  // The editable prompt config (model + instructions + message template +
  // output schema) — loaded once per batch, from the compose_prompt singleton
  // if saved, else the in-code defaults.
  const promptCfg = await loadComposePrompt();
  const playbooks = await loadPlaybooks();
  // Memoize the KB per Category so the general company file isn't re-read from
  // disk once per lead, and same-Category leads get a byte-identical (and thus
  // cacheable) system prefix.
  const kbByCategory = new Map<string, string>();
  const kbFor = async (category: string | null | undefined): Promise<string> => {
    const key = (category ?? "").toLowerCase().trim();
    const hit = kbByCategory.get(key);
    if (hit !== undefined) return hit;
    const kb = await buildComposeKb(category, playbooks);
    kbByCategory.set(key, kb);
    return kb;
  };

  const results: ComposeDraft[] = [];
  let drafted = 0;
  for (const lead of leads) {
    const { draft, ai } = await draftForLead(lead, await kbFor(lead.category), promptCfg);
    results.push(draft);
    if (ai) drafted += 1;
  }

  // Key set but every draft fell back to the template (bad key, outage, all
  // refusals) → report demo, so the UI flags "demo drafts" instead of passing
  // identical template copy off as per-lead AI writing.
  return json({ ok: true, mode: drafted > 0 ? "live" : "demo", campaign, results, drafted, saved: 0 });
}

function json(result: ComposeResult, status = 200): Response {
  return Response.json(result, { status });
}
