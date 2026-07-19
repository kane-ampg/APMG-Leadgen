import { sameOrigin } from "@/lib/pipeline/server";
import { draftPortalChatReply, type ChatTurn } from "@/lib/ai/portalChat";
import { clientIp, rateLimit } from "@/lib/portal/chatRateLimit";
import { MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS } from "@/lib/portal/chatLimits";

/**
 * Public portal chat endpoint — the customer-facing chat bubble (PortalChat)
 * POSTs here. It spends the walled-off PORTAL_CHAT_ANTHROPIC_KEY on behalf of
 * anonymous visitors, so it is a spend surface and carries layered guardrails:
 *
 *   1. sameOrigin (CSRF floor) — only our own portal pages may call it.
 *   2. Per-IP rate limit (lib/portal/chatRateLimit) — N msgs / window, so one
 *      visitor or a script can't loop the key. Returns 429 + Retry-After.
 *   3. Hard input caps — message length + history-turn count, so a single
 *      request can't smuggle a huge (expensive) prompt.
 *   4. KB-only system prompt (lib/ai/portalChat) — the model refuses off-topic /
 *      jailbreak use, so the bubble can't be repurposed as a free general LLM.
 *
 * Degrades gracefully: with no key configured or on any API error it returns a
 * friendly fallback (200, `fallback: true`) nudging the visitor to the enquiry
 * form, so the bubble is never a dead end.
 *
 * NOTE: the rate limiter is in-memory / per-instance (see chatRateLimit). It's a
 * launch-grade floor; if abuse becomes real, back the counter with Supabase.
 */
export const runtime = "nodejs";

/** Shown when we can't (or won't) produce a model reply — never a hard error to
 *  the visitor; always points them at the real lead-capture path. */
const FALLBACK =
  "I can't answer that right now — but the team can! Tap “Enquire” on any service above and we'll get straight back to you.";

function isTurn(v: unknown): v is ChatTurn {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (t.role === "user" || t.role === "assistant") && typeof t.content === "string";
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  // (2) Per-IP rate limit — before we parse or spend anything.
  const gate = rateLimit(clientIp(req));
  if (!gate.allowed) {
    const retryAfter = Math.ceil(gate.retryAfterMs / 1000);
    return Response.json(
      {
        ok: true,
        fallback: true,
        reply:
          "You've sent a lot of messages in a short time — give me a moment. Meanwhile, tap “Enquire” above and the team will reach out.",
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // (3) Input caps — validate the newest message and the history.
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) {
    return Response.json({ ok: false, error: "Empty message." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      { ok: false, error: `Please keep it under ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 },
    );
  }

  // History is optional; keep only the most recent valid turns.
  const rawHistory = Array.isArray(b.history) ? b.history : [];
  const history: ChatTurn[] = rawHistory
    .filter(isTurn)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE_CHARS) }));

  // (4) KB-grounded reply. null → degrade to the enquiry-form nudge (never error).
  const reply = await draftPortalChatReply(history, message);
  if (!reply) {
    return Response.json({ ok: true, fallback: true, reply: FALLBACK });
  }

  return Response.json({ ok: true, reply });
}
