# APMG Leadgen — Documentation

This folder documents the Claude Code sessions that built and maintained the **APMG Leadgen** dashboard. Each session has a dedicated write-up in [sessions/](sessions/) covering the objective, what was actually done, files touched, decisions, problems, and final state.

> **Note on scope:** This is the leadgen project's own history. The project has six Claude sessions to date (five feature/fix sessions plus the session that produced this folder). They are documented in full below.

---

## Project snapshot

**APMG Leadgen** is a lead-generation dashboard for **APMG Services**.

- **Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS · `motion/react` for animation.
- **Look & feel:** A black/red "Signal" telemetry-console aesthetic, **dark-mode by default** with a light toggle. Follows the `ui-standards.md` design grammar (adapted from "Simple HRIS").
- **Instrumentation:** End-to-end **click telemetry** (`data-track` attributes) with a live in-app telemetry inspector.
- **Surfaces built so far:**
  - **Overview** — a fused, hairline-divided KPI panel + greeting, a hand-rolled leads histogram, and a recent-leads table.
  - **Integrations** (Automate section) — an n8n automation registry rendered as a connection bar + card grid with live toggles and deep-links.
  - **Pipeline** — a two-tab surface: **Leads** (an n8n-style stepped flow that imports the Bing-scraper CSV export and pushes rows to Supabase) and **Send Campaigns (Automation)** (tracked HTML outreach to stored leads via the n8n webhook). Both run in demo mode until their credentials/webhook are added.
  - Sidebar navigation, a dynamic-year footer ("Developed by APMG © {year}"), and an APMG favicon.

---

## Session index

Sessions are numbered in chronological **start** order. Several ran **concurrently** on 2026-06-29 — which is what triggered the dev-server collision fixed in Session 04.

| # | Session | Date (local) | Duration | Status | Doc |
|---|---------|--------------|----------|--------|-----|
| 01 | UI Foundation — Black/Red "Signal" Lead-Gen Dashboard | 2026-06-29, 01:19–02:58 | ~1h39m | ✅ Completed | [01-ui-foundation-dashboard.md](sessions/01-ui-foundation-dashboard.md) |
| 02 | Integrations tab for wiring n8n automations | 2026-06-29, 02:09–02:53 | ~44m | ✅ Completed | [02-integrations-tab-n8n.md](sessions/02-integrations-tab-n8n.md) |
| 03 | Pipeline CSV Importer (Bing scraper → Supabase) | 2026-06-29, 02:28–03:04 | ~36m | ✅ Completed (demo mode) | [03-api-search-integration.md](sessions/03-api-search-integration.md) |
| 04 | Fixing Next.js Dev-Server ENOENT / Turbopack cache corruption | 2026-06-29, 02:53–02:56 | ~3m | ✅ Resolved | [04-dev-server-enoent-fix.md](sessions/04-dev-server-enoent-fix.md) |
| 05 | Session Documentation (this folder) | 2026-06-29, ~03:00 | — | ✅ Completed | [05-session-documentation.md](sessions/05-session-documentation.md) |
| 06 | Pipeline "Send Campaigns (Automation)" sub-tab | 2026-06-30 | — | ✅ Completed (demo mode) | [06-pipeline-send-campaigns.md](sessions/06-pipeline-send-campaigns.md) |

---

## Session summaries

### [01 — UI Foundation: Black/Red "Signal" Lead-Gen Dashboard](sessions/01-ui-foundation-dashboard.md)
Scaffolded the dashboard from an empty repo into a Next.js 16 black/red "telemetry console": the **Overview** page (fused KPI panel, histogram, recent-leads table), sidebar, dynamic-year footer, dark/light toggle, and end-to-end click telemetry with a live inspector. The visual direction ("SIGNAL/RAIL") was chosen via a judged 3-way design panel, then hardened against a multi-agent adversarial review (AA-contrast, accessibility, reduced-motion). Build green on Turbopack; states verified via Playwright.
**Key outcome:** the working foundation everything else builds on. *(~40 files created.)*

### [02 — Integrations tab for wiring n8n automations](sessions/02-integrations-tab-n8n.md)
Added an **Integrations** tab under a new "Automate" sidebar section, backed by a typed n8n automation registry ([lib/data/integrations.ts](../lib/data/integrations.ts)) and a card-grid UI ([IntegrationsPage.tsx](../components/apmg/IntegrationsPage.tsx)) with status pills, on/off toggles, run stats, and "Open in n8n" deep-links. Along the way, fixed a **pre-existing** `useSyncExternalStore` infinite-loop warning in [lib/telemetry.ts](../lib/telemetry.ts), and set the APMG logo as the favicon ([app/icon.png](../app/icon.png)).
**Open items:** n8n data is seed-only (no live instance); the favicon is non-square/white-on-transparent.

### [03 — Pipeline CSV Importer (Bing scraper → Supabase)](sessions/03-api-search-integration.md)
The user's "can we hit this Bing Maps URL as an API?" question was reframed into an in-app **Pipeline** tool: an n8n-style animated 3-step flow (Upload → Read & parse → Push to Supabase) that ingests the Bing scraper's CSV export and inserts rows via a Supabase route handler. CSV parser verified against the real 46-row export; route hardened (row sanitization, same-origin floor, no error leakage) after an adversarial review; typecheck + production build green.
**Open items:** runs in demo mode until Supabase creds are added; live write and real auth are pre-production TODOs.

### [04 — Fixing Next.js Dev-Server ENOENT / Turbopack cache corruption](sessions/04-dev-server-enoent-fix.md)
Diagnosed repeated `ENOENT` / missing-`[turbopack]_runtime.js` errors as the symptom of **three Next.js servers sharing one `.next` directory** (two `next dev` + one `next start`). Stopped the conflicting server trees, deleted the corrupted `.next`, and restored a single clean dev server returning **200**. No source/config files changed — pure operational remediation. A `distDir`-isolation hardening tip was recommended but intentionally not applied.

### [05 — Session Documentation (this folder)](sessions/05-session-documentation.md)
The effort that produced this `documentation/` folder: located the session transcripts, confirmed scope with the user, condensed each large JSONL transcript deterministically, and ran a multi-agent workflow that wrote one fact-checked doc per session.

### [06 — Pipeline "Send Campaigns (Automation)" sub-tab](sessions/06-pipeline-send-campaigns.md)
Turned the single-page **Pipeline** importer into a two-tab surface and added a **Send Campaigns (Automation)** tab: pick stored leads that have an email, compose a tracked HTML outreach email (subject + body with `{{business}}`/`{{link}}` merge tokens, live sandboxed preview), and send via an n8n webhook (or simulated in demo mode). Each recipient's CTA is rewritten to the existing `/t/<lead>?c=<campaign>` attribution hook, closing the scrape → email → email-gated Sales loop. Backed by a new `campaigns.send` permission and a shared client/server render module; a 5-dimension background adversarial review (31 agents, 26 findings) yielded 3 confirmed low-severity fixes.
**Open items:** live n8n delivery unexercised in-session; persisting `email_sent`/`engaged` to Supabase remains a TODO (Sales data is still seed); send route needs real auth before public exposure.

---

## How this documentation was produced

The session transcripts live as JSONL files under Claude Code's project store. Each was condensed (user messages, assistant reasoning, tool calls, truncated results) and handed to a **documenter** agent, then independently fact-checked by an **adversarial verifier** agent against both the transcript and the live repo. See [Session 05](sessions/05-session-documentation.md) for the full method.

**Maintaining this folder:** when a future session does meaningful work, add a new `sessions/NN-*.md` (same template) and add a row to the index above.
