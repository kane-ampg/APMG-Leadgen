import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { renderLeadPrompt, type ComposeLeadFacts, type DraftedEmail } from "./composePrompt";
import {
  loadComposePrompt,
  resolveModel,
  type ComposePromptConfig,
} from "./composeStore";

/**
 * In-app cold-email composer. Given a lead's public details and the sector
 * knowledge base (APMG's own service offerings, from Supabase / the repo KB
 * files — see lib/pipeline/sectorStore.ts), Claude drafts one short, grounded
 * outreach email — subject + HTML body — pitching APMG's real property-
 * maintenance services to the recipient's own facility (never lead generation
 * or marketing). Mirrors lib/ai/leadSummary.ts.
 *
 * The model, system instructions, per-lead message, and output shape live in
 * lib/ai/composePrompt.ts (shared, so the read-only "Email Composer" config tab
 * can display the exact prompt). Model is claude-opus-4-8 by default; override
 * with COMPOSE_MODEL (allow-listed so a typo can't 404 every draft). Returns
 * null when ANTHROPIC_API_KEY is unset or the call fails, so the compose route
 * degrades to its deterministic template (campaign.ts demoDraft).
 *
 * The KB is stable per sector, so it goes in a cache_control system block: when
 * the instructions + KB prefix clears the model's minimum cacheable size, a
 * batch of same-sector leads reuses it at ~0.1x input cost (see the sequential
 * drafting loop in the compose route).
 */

export type { ComposeLeadFacts, DraftedEmail };

/**
 * Force every anchor's href to the literal {{link}} token. The email carries a
 * single CTA anchor; if the model ever links a real URL (the KB names
 * apmgservices.com.au) the send route would ship an untracked link and — since
 * ensureLinkToken only looks for the {{link}} substring — append a SECOND CTA
 * below the sign-off. Rewriting the href guarantees exactly one tracked CTA.
 */
function forceTrackedCta(html: string): string {
  return html.replace(/href\s*=\s*("[^"]*"|'[^']*')/gi, 'href="{{link}}"');
}

/**
 * Draft one lead's email. `kb` is the combined general + sector markdown for the
 * lead (from buildComposeKb). `config` is the resolved prompt config (model,
 * instructions, per-lead message template, output schema) — pass one loaded once
 * per batch (loadComposePrompt) so a run doesn't hit the DB per lead; omitted, it
 * loads the current config itself. Returns the {subject, html} on success, or
 * null on any miss (no API key, API/parse error, empty fields) so the caller can
 * fall back to the deterministic template.
 */
export async function draftEmail(
  facts: ComposeLeadFacts,
  kb: string,
  config?: ComposePromptConfig,
): Promise<DraftedEmail | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const knowledge = kb.trim();
  const cfg = config ?? (await loadComposePrompt());

  try {
    // Bound a single hung/slow draft (the compose route runs leads sequentially
    // under a fixed maxDuration); on timeout we degrade to the template.
    const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
    const message = await client.messages.create({
      // A saved/allow-listed model wins; a bad value can't 404 the whole batch.
      model: resolveModel(cfg.model),
      max_tokens: 1500,
      // The KB is the stable, cacheable tail of the system prefix; same-sector
      // leads processed back-to-back reuse it (usage.cache_read_input_tokens).
      system: [
        { type: "text", text: cfg.instructions },
        {
          type: "text",
          text: knowledge
            ? `APMG KNOWLEDGE BASE — the only facts you may use:\n\n${knowledge}`
            : "No knowledge base was available. Use only the general APMG facts stated in the instructions above and do not invent specifics.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: renderLeadPrompt(cfg.leadPromptTemplate, facts) }],
      output_config: { format: { type: "json_schema", schema: cfg.outputSchema } },
    });

    const raw = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const subject = typeof o.subject === "string" ? o.subject.trim() : "";
    const html = typeof o.html === "string" ? o.html.trim() : "";
    if (!subject || !html) return null;

    return { subject, html: forceTrackedCta(html) };
  } catch {
    // No key / network / auth / rate-limit / malformed JSON — degrade to the
    // template. One lead failing never aborts the batch.
    return null;
  }
}
