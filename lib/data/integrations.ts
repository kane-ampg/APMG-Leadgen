/**
 * n8n automation registry for the Integrations surface.
 *
 * These are the real workflows the Lead Desk hands off to n8n. Each entry maps
 * to one n8n webhook the app POSTs to. The live wiring state (whether a webhook
 * URL is configured, and where it came from) is resolved server-side by
 * app/api/integrations from app_settings → env var → demo, and merged with the
 * static metadata below for display.
 */

/** Base URL of the n8n instance these automations live on. */
export const N8N_BASE_URL = "https://apmg.app.n8n.cloud";

export type TriggerKind = "webhook" | "schedule" | "event";
/** connected = configured + toggle on (live); paused = configured but toggled
 *  off (simulated); demo = no webhook set (simulated). */
export type AutomationStatus = "connected" | "paused" | "demo" | "error";

/** Static metadata for one real n8n integration (safe to ship to the browser —
 *  carries the setting keys + env-var NAME, never the secret value). */
export interface IntegrationMeta {
  id: string;
  /** app_settings key holding the webhook URL override */
  settingKey: string;
  /** app_settings key holding the on/off toggle ("false" = off; default on) */
  enabledKey: string;
  /** env var consulted when no saved override exists (name only, not value) */
  envVar: string;
  name: string;
  description: string;
  trigger: TriggerKind;
  /** the webhook path the workflow listens on, e.g. /webhook/compose-email */
  webhookPath: string;
  /** reference workflow file that ships in the repo, for the operator to import */
  workflowFile: string;
}

/** Live wiring state for one integration, returned by /api/integrations. */
export interface IntegrationState {
  id: string;
  configured: boolean;
  /** the on/off toggle (defaults on) */
  enabled: boolean;
  /** masked webhook URL when configured, else null */
  maskedUrl: string | null;
  /** where the configured URL came from */
  source: "setting" | "env" | null;
  status: AutomationStatus;
}

/** Meta + live state, as rendered on the Integrations page. */
export type Integration = IntegrationMeta & IntegrationState;

/**
 * The app's real n8n integrations, in display order. Each maps to one webhook
 * the app POSTs to: Compose Email (drafting) and Campaign Send (delivery). Add
 * an entry here when a new workflow is wired up; the Integrations page renders
 * whatever is listed, each with its own Add/Update webhook button. The keys here
 * MUST match lib/pipeline/server.ts (SETTING_* / env vars) so the tab writes the
 * same app_settings rows the routes read.
 */
export const INTEGRATIONS: IntegrationMeta[] = [
  {
    id: "compose-email",
    settingKey: "n8n_compose_webhook_url",
    enabledKey: "n8n_compose_webhook_enabled",
    envVar: "N8N_COMPOSE_WEBHOOK_URL",
    name: "Compose Email",
    description:
      "Clicking Compose email sends the selected leads here. The automation extracts up to 10 emails per lead (CSV first, contact-page scrape as the fallback), then Claude drafts a per-lead email tailored to the lead's category.",
    trigger: "webhook",
    webhookPath: "/webhook/compose-email",
    workflowFile: "Compose Email Automation.json",
  },
  {
    id: "campaign-send",
    settingKey: "n8n_campaign_webhook_url",
    enabledKey: "n8n_campaign_webhook_enabled",
    envVar: "N8N_CAMPAIGN_WEBHOOK_URL",
    name: "Campaign Send",
    description:
      "Confirming a send in Pipeline → Send Campaigns POSTs the rendered outreach emails here. The automation sends each message via Gmail (the email copy is grounded per category by the Sector Playbooks knowledge base at compose time).",
    trigger: "webhook",
    webhookPath: "/webhook/campaign-send",
    workflowFile: "Campaign Send Automation.json",
  },
];
