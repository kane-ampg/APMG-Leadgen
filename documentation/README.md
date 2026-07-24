# APMG Leadgen — Documentation

This folder documents the Claude Code sessions that built and maintained the **APMG Leadgen** dashboard. Each session has a dedicated write-up in [sessions/](sessions/) covering the objective, what was actually done, files touched, decisions, problems, and final state.

> **Scope & numbering:** Docs are numbered as stable IDs, not in strict chronological order — use the **Date** column for chronology. Docs **01–06** were written in the first documentation pass (2026-06-29). Docs **07–12** were added in a **2026-06-30 refresh** that reviewed the last ~10 Claude sessions and found that (a) several new sessions weren't documented, and (b) two already-documented sessions had *continued* far beyond their original write-ups. Because the docs are session-keyed, those continuations get their own docs that share a Session ID with an earlier doc — cross-referenced both ways. A handful of trivial/ad-hoc sessions are noted at the bottom rather than given full docs.

---

## Project snapshot

**APMG Leadgen** is a lead-generation dashboard for **APMG Services** with an admin console, a customer-facing client portal, and a sales console — all in one role-gated app.

- **Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS · `motion/react` for animation · **Supabase** (Postgres via PostgREST) for lead storage · **`@anthropic-ai/sdk`** (`claude-opus-4-8`) for AI lead briefs · n8n for outbound automation.
- **Look & feel:** A black/red "Signal" telemetry-console aesthetic, **dark-mode by default** with a light toggle. Follows the `ui-standards.md` design grammar (adapted from "Simple HRIS").
- **Access control:** **Permission-first RBAC** — roles (`admin` / `client` / `sales`) are bundles of atomic `resource.action` permissions; every gate checks a permission, never a role. *(Server-side role resolution is still a placeholder pending a real Supabase session.)*
- **Instrumentation:** End-to-end **click telemetry** (`data-track` attributes) with a live in-app telemetry inspector.
- **Surfaces built so far:**
  - **Overview** — **role-aware** for admin/client/sales, with KPI cards that read the **live** Supabase `public.leads` data (via `useLeadStats`), a Week/Day/Month auto-cycling histogram, and a recent-leads table.
  - **Pipeline** (admin) — **Leads** (an n8n-style stepped importer that ingests the Bing-scraper CSV, asks "Save leads?", and writes **live** to Supabase, with a realtime stats strip) and **Send Campaigns (Automation)** (tracked HTML outreach via the n8n webhook).
  - **Leads** (admin + client) — a folder browser over the stored Supabase leads (per-upload "folders", multi-select delete, per-lead detail modal).
  - **Sales** — a paginated queue of every lead admin has emailed (gated on the `email_sent` ledger in `portal_events`, served by `/api/sales/queue`), fed by an email **attribution** hook (`/t/[id]`), plus a guided **Closed** flow and a **Closed-deals** tab. *(Queue data is live; contacted/closed statuses are still session-only.)*
  - **Integrations** (Automate) — an n8n automation registry as a connection bar + card grid.
  - Sidebar navigation (permission-filtered, live Pipeline badge), a dynamic-year footer, and an APMG favicon.
- **Live vs. pending:** lead storage is **live** on Supabase (real imports confirmed). Still pending: **real auth** on the server routes (service-role key behind a same-origin floor only), persisting attribution/`engaged` + sales-stage data, and a live n8n webhook for campaigns.

---

## Session index

| # | Session | Date (local) | Source session | Status | Doc |
|---|---------|--------------|----------------|--------|-----|
| 01 | UI Foundation — Black/Red "Signal" Dashboard | 2026-06-29, 01:19–02:58 | `c954dda6` | ✅ Completed | [01-ui-foundation-dashboard.md](sessions/01-ui-foundation-dashboard.md) |
| 02 | Integrations tab (n8n automations) | 2026-06-29, 02:09–02:53 | `45b82d8b` | ✅ Completed | [02-integrations-tab-n8n.md](sessions/02-integrations-tab-n8n.md) |
| 03 | Pipeline CSV Importer (Bing → Supabase) | 2026-06-29, 02:28–03:04 | `5fc1ceac` | ✅ Completed (demo) | [03-api-search-integration.md](sessions/03-api-search-integration.md) |
| 04 | Dev-Server ENOENT / Turbopack cache fix | 2026-06-29, 02:53–02:56 | `1cf2c10f` | ✅ Resolved | [04-dev-server-enoent-fix.md](sessions/04-dev-server-enoent-fix.md) |
| 05 | Session Documentation (this folder) | 2026-06-29, ~03:00 | `c1e23843` | ✅ Completed | [05-session-documentation.md](sessions/05-session-documentation.md) |
| 06 | Pipeline "Send Campaigns (Automation)" sub-tab | 2026-06-30, 02:35–03:01 | `63731537` | ✅ Completed (demo) | [06-pipeline-send-campaigns.md](sessions/06-pipeline-send-campaigns.md) |
| 07 | Role-Based Access Control (permission-first) | 2026-06-29, ~03:00–08:49 | `c954dda6` *(cont. of 01)* | ✅ Built (auth pending) | [07-rbac-permission-first.md](sessions/07-rbac-permission-first.md) |
| 08 | Sales pipeline — queue, attribution, AI briefs, closed-deals | 2026-06-29 | `c954dda6` *(cont. of 01)* | ✅ Built (preset data) | [08-sales-pipeline-attribution.md](sessions/08-sales-pipeline-attribution.md) |
| 09 | Pipeline goes **live** on Supabase + stored-leads viewer & folders | 2026-06-29 → 06-30 | `5fc1ceac` *(cont. of 03)* | ✅ **LIVE** (auth pending) | [09-pipeline-supabase-live.md](sessions/09-pipeline-supabase-live.md) |
| 10 | End-of-shift update + ChunkLoadError fix | 2026-06-29, 03:02–07:59 | `855d0ed5` | ✅ Resolved | [10-eod-update-chunkload-fix.md](sessions/10-eod-update-chunkload-fix.md) |
| 11 | Pipeline UX: "Save leads?" gate + animations | 2026-06-30, 01:43–02:29 | `2e78c6b2` | ✅ Shipped | [11-pipeline-save-confirm-animations.md](sessions/11-pipeline-save-confirm-animations.md) |
| 12 | Role-aware Overview redesign + UI/UX Pro Max skill | 2026-06-30, 01:49–02:50 | `d36a821e` | ✅ Shipped | [12-overview-role-aware-redesign.md](sessions/12-overview-role-aware-redesign.md) |

> **Note on overlap:** Several sessions ran **concurrently** on 2026-06-29–30 (the user co-edited files live), which is what caused the dev-server collisions in Sessions 04 and 10 and the edit-reconciliation noted in Sessions 08 and 09.

---

## Session summaries

### [01 — UI Foundation: Black/Red "Signal" Dashboard](sessions/01-ui-foundation-dashboard.md)
Scaffolded the dashboard from an empty repo into a Next.js 16 black/red "telemetry console": the Overview page, sidebar, dynamic-year footer, dark/light toggle, and end-to-end click telemetry. Visual direction chosen via a judged 3-way design panel, then hardened by a multi-agent adversarial review. *(This session continued — see 07 & 08.)*

### [02 — Integrations tab for wiring n8n automations](sessions/02-integrations-tab-n8n.md)
An **Integrations** tab under a new "Automate" section, backed by a typed n8n automation registry and a card-grid UI. Also fixed a pre-existing telemetry infinite-loop and set the APMG favicon.

### [03 — Pipeline CSV Importer (demo mode)](sessions/03-api-search-integration.md)
Reframed "can we hit this Bing Maps URL as an API?" into an in-app **Pipeline** importer: an n8n-style 3-step flow that parses the Bing scraper's CSV and inserts rows via a Supabase route handler, running in demo mode. *(This session continued — see 09.)*

### [04 — Dev-Server ENOENT / Turbopack cache corruption](sessions/04-dev-server-enoent-fix.md)
Diagnosed repeated `ENOENT` errors as **three Next.js servers sharing one `.next`**; stopped the conflicting trees, cleared the cache, restored a single clean dev server. *(See 10 for a related recurrence.)*

### [05 — Session Documentation (this folder)](sessions/05-session-documentation.md)
The effort that produced this `documentation/` folder: located the transcripts, condensed each large JSONL deterministically, and ran a multi-agent workflow that wrote one fact-checked doc per session.

### [06 — Pipeline "Send Campaigns (Automation)" sub-tab](sessions/06-pipeline-send-campaigns.md)
Turned Pipeline into a two-tab surface and added a **Send Campaigns** tab: pick stored emailable leads, compose a tracked HTML email (merge tokens + live preview), and send via an n8n webhook (or simulate in demo mode). Each CTA rewrites to the `/t/<lead>?c=<campaign>` attribution hook.

### [07 — Role-Based Access Control (permission-first)](sessions/07-rbac-permission-first.md)
Built the RBAC layer (continuation of session 01): roles as bundles of atomic `resource.action` permissions, with the nav, shell, sidebar, and telemetry button all gating on permissions. `admin`/`client` active, `sales` reserved (enabled later). The server-side role guard is an explicit placeholder pending a real session.

### [08 — Sales pipeline: queue, attribution, AI briefs & closed-deals](sessions/08-sales-pipeline-attribution.md)
Built the Sales surface (continuation of session 01): an `emailSent`-gated queue with contacts + Claude-backed AI briefs, an email-attribution endpoint (`/t/[id]`), an edited n8n automation that links into it, and a guided **Closed** flow (required note) feeding a Closed-deals tab. Data is preset; attribution persistence and real auth are TODOs.

### [09 — Pipeline goes live on Supabase + stored-leads viewer & folders](sessions/09-pipeline-supabase-live.md)
Took the demo importer **live** (continuation of session 03): real Supabase creds (gitignored), a read-back API + stored-leads viewer, per-upload **folders** (a `batch` column with a guided migration card), a `DELETE` method, and a standalone **Leads** tab (folder browser + per-lead detail modal). Real reads/writes confirmed (46→124 rows); real auth still pending.

### [10 — End-of-shift update + ChunkLoadError fix](sessions/10-eod-update-chunkload-fix.md)
Produced a real-diff-grounded end-of-shift report, and fixed a `ChunkLoadError` caused by one `.next` directory holding both a production build and a dev session (a distinct incident from Session 04). No source files changed.

### [11 — Pipeline UX: "Save leads?" gate + animations](sessions/11-pipeline-save-confirm-animations.md)
Three pipeline-UX refinements: a "Save leads?" confirmation gate before the Supabase write, a smooth eased upload progress, and an animated trash→confirm slide-in overlay on folder cards (zero layout shift). `tsc` clean.

### [12 — Role-aware Overview redesign + UI/UX Pro Max skill](sessions/12-overview-role-aware-redesign.md)
Installed the UI/UX Pro Max skill, then rebuilt the Overview as a role-aware surface whose KPI cards read **live** pipeline data via a new `useLeadStats` hook. Added a Week/Day/Month auto-cycling histogram, a realtime Pipeline stats strip, and a live Sidebar badge; granted `sales` the `overview.view` permission.

---

## Non-feature / ad-hoc sessions (not given full docs)

These appeared in the last-10 review but aren't project build/fix work, so they're noted here rather than documented:

- **`4cc39adc`** (2026-06-29, ~20:37 local) — a one-message writing-assist task: rewording a short message to "Evan" about creating an Anthropic organization for APMG. No code, no project impact.
- **`6ef4c670`** (2026-06-30, in progress at time of refresh) — a read-only session generating an **end-of-shift update** (same deliverable as the report half of Session 10); confirmed the build was green (`tsc` exit 0) but changed nothing.

---

## How this documentation was produced

The session transcripts live as JSONL files under Claude Code's project store. Each was condensed deterministically (user messages, assistant reasoning, tool calls, truncated results, plus an auto-extracted "files touched" list), then analysed against the **live repo**. The 2026-06-30 refresh used parallel analysis agents to compute the *delta* between each large transcript and its existing doc, then authored docs 07–12 from those verified reports.

**Maintaining this folder:** when a future session does meaningful work, add a new `sessions/NN-*.md` (same template) and a row to the index above. If a session that already has a doc *continues* and does substantially new work, add a new numbered doc that shares its Session ID and cross-reference both ways (as 07/08 do with 01, and 09 does with 03).
