import {
  bestEmail,
  isEmail,
  MAX_RECIPIENTS,
  renderBody,
  renderSubject,
  safeCampaignTag,
  trackedLink,
} from "@/lib/pipeline/campaign";
import { campaignWebhook, sameOrigin } from "@/lib/pipeline/server";

// Sends an outreach email campaign to a set of stored leads. Each message's CTA
// is rewritten to the attribution hook /t/<leadId>?c=<campaign> (app/t/[id]),
// so a click flips the lead's "Engaged" badge in the Sales queue. Runs on Node.
//
// Delivery: when N8N_CAMPAIGN_WEBHOOK_URL is set we POST the rendered messages
// to that n8n webhook (the "Send a message" Gmail node); otherwise we simulate a
// successful send (demo mode), mirroring the CSV importer.
//
// SECURITY — TODO before exposing publicly: like the other pipeline routes this
// has only a same-origin (CSRF) floor, NOT real auth. The UI gates the action
// behind the `campaigns.send` permission; enforce it here too once auth lands.
//
// TODO(supabase): after a live send, stamp leads.email_sent = true /
// email_sent_at = now for each recipient so the Sales-queue gate is persisted.
export const runtime = "nodejs";

const MAX_SUBJECT = 300;
const MAX_HTML = 20_000;

type SendMode = "live" | "demo" | "noop";

interface SendResult {
  ok: boolean;
  sent: number;
  mode: SendMode;
  campaign?: string;
  error?: string;
}

interface CleanRecipient {
  id: string;
  email: string;
  business?: string;
}

/** Whitelist a client recipient → {id, email, business}. Accepts an explicit
 *  `email`, or derives the best contact from an `emails` array. Drops anything
 *  without a stable id or a valid address. */
function sanitizeRecipient(input: unknown): CleanRecipient | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;

  const explicit = typeof o.email === "string" ? o.email.trim() : "";
  const derived = Array.isArray(o.emails)
    ? bestEmail(o.emails.filter((x): x is string => typeof x === "string"))
    : null;
  const email = explicit || derived || "";
  if (!isEmail(email)) return null;

  const business = typeof o.business === "string" && o.business.trim() ? o.business.trim() : undefined;
  return { id, email, business };
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return json({ ok: false, sent: 0, mode: "noop", error: "Forbidden." }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, sent: 0, mode: "noop", error: "Invalid JSON body." }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const campaign = safeCampaignTag(b.campaign);
  if (!campaign) {
    return json({ ok: false, sent: 0, mode: "noop", error: "Invalid campaign tag — use letters, numbers, and dashes." }, 400);
  }

  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  if (!subject || subject.length > MAX_SUBJECT) {
    return json({ ok: false, sent: 0, mode: "noop", error: "A subject line is required." }, 400);
  }

  const bodyHtml = typeof b.bodyHtml === "string" ? b.bodyHtml : "";
  if (!bodyHtml.trim() || bodyHtml.length > MAX_HTML) {
    return json({ ok: false, sent: 0, mode: "noop", error: "An email body is required." }, 400);
  }

  const rawRecipients = b.recipients;
  if (!Array.isArray(rawRecipients)) {
    return json({ ok: false, sent: 0, mode: "noop", error: "Expected { recipients: [...] }." }, 400);
  }
  if (rawRecipients.length > MAX_RECIPIENTS) {
    return json({ ok: false, sent: 0, mode: "noop", error: `Too many recipients (max ${MAX_RECIPIENTS}).` }, 413);
  }

  // sanitize + dedupe by address (a lead listed twice is mailed once)
  const seen = new Set<string>();
  const recipients: CleanRecipient[] = [];
  for (const r of rawRecipients) {
    const clean = sanitizeRecipient(r);
    if (!clean) continue;
    const key = clean.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(clean);
  }
  if (recipients.length === 0) {
    return json({ ok: false, sent: 0, mode: "noop", error: "No recipients with a valid email address." }, 400);
  }

  // Build the tracked, personalized message for each recipient. NEXT_PUBLIC_TRACK_BASE
  // pins the link host (e.g. the deployed domain); otherwise we use this request's origin.
  const base = process.env.NEXT_PUBLIC_TRACK_BASE || new URL(req.url).origin;
  const messages = recipients.map((r) => ({
    to: r.email,
    leadId: r.id,
    subject: renderSubject(subject, { business: r.business }),
    html: renderBody(bodyHtml, { business: r.business, link: trackedLink(base, r.id, campaign) }),
  }));

  const target = campaignWebhook();
  if (target.state === "demo") {
    // Demo mode — no webhook configured. Simulate a successful send so the tab
    // is fully exercisable before n8n is wired up.
    return json({ ok: true, sent: messages.length, mode: "demo", campaign });
  }

  let res: Response;
  try {
    res = await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign, messages }),
    });
  } catch (e) {
    console.error("[pipeline/campaigns] fetch to n8n webhook failed:", e);
    return json({ ok: false, sent: 0, mode: "live", error: "Could not reach the campaign automation." }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[pipeline/campaigns] n8n webhook ${res.status}:`, detail.slice(0, 1000));
    return json({ ok: false, sent: 0, mode: "live", error: "The automation rejected the campaign." }, 502);
  }

  return json({ ok: true, sent: messages.length, mode: "live", campaign });
}

function json(result: SendResult, status = 200): Response {
  return Response.json(result, { status });
}
