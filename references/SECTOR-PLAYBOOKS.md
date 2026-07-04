# Sector Playbooks — per-category PDF + knowledge base

Routes each lead to a **sector** by its CSV `Category`, then:

- **attaches** that sector's portfolio **PDF** to its outreach email, and
- **grounds** the AI-written copy in that sector's **knowledge base** (`components/knowledgebase/<slug>.md`).

Configured from the **Sector Playbooks** tab (Automate group, admin-only — `playbooks.view` / `playbooks.manage`).

## Sectors (defaults)

| slug | name | example Category matches | KB file |
|---|---|---|---|
| `aged-care` | Aged Care & Health | aged care, nursing home, retirement, health, ndis | `aged-care.md` |
| `early-childhood` | Early Childhood / Early Learning | childcare, early learning, kindergarten, daycare | `early-childhood.md` |
| `education` | Education / Schools | school, college, university, tafe | `education.md` |

Category keywords are editable per sector in the tab. Matching is case-insensitive substring, **longest keyword wins** (so "primary school" → Education, "aged care" beats a stray "care"). No match → the email sends with no attachment.

## Where things live

- **Config mapping** → `app_settings["sector_playbooks"]` (JSON: `{ slug, name, categories[], pdf }`). Defaults from `lib/pipeline/sectors.ts` fill any unset field.
- **PDFs** → public Supabase Storage bucket **`sector-assets`** at `<slug>.pdf`. Uploaded from the tab (or the seed script). Public-read so n8n can fetch them.
- **KB markdown** → `components/knowledgebase/<slug>.md` (repo files, source of truth; shown read-only in the tab).

## Code map

- `lib/pipeline/sectors.ts` — pure model + `resolveSectorForCategory()` + defaults (shared client/server).
- `lib/pipeline/sectorStore.ts` — server load/save + PDF public URL.
- `lib/pipeline/server.ts` — Storage helpers (`uploadObject`/`deleteObject`/`publicObjectUrl`) + `SECTOR_ASSETS_BUCKET`.
- `app/api/sector-playbooks/route.ts` — GET config + POST (name/categories).
- `app/api/sector-playbooks/pdf/route.ts` — POST upload / DELETE remove PDF.
- `components/apmg/SectorPlaybooksPage.tsx` — the tab.
- `app/api/pipeline/campaigns/send/route.ts` — resolves each recipient's Category → attaches `attachment: { url, filename }` per message.
- `references/Campaign Send Automation.json` — n8n webhook send workflow: downloads `attachment.url` and attaches it via Gmail.

## The email path (attachments happen at SEND, not compose)

1. **Compose** (`Compose Email Automation.json`) only drafts subject/html.
2. **Send** — the tab POSTs to `app/api/pipeline/campaigns/send`, which resolves each lead's Category → sector → PDF public URL and adds `attachment` to each message.
3. The **send webhook** (`Campaign Send Automation.json`) downloads the PDF and attaches it on the Gmail node. No attachment field → sends plain.

## Setup

1. **Compress the source PDFs** (40 MB scans → ~2.7 MB emailable) into `references/portfolios/`:
   ```bash
   python - <<'PY'
   import fitz, os
   for name, slug in {"Aged Care":"aged-care","Early":"early-childhood","Education":"education"}.items():
       doc = fitz.open(f"references/{name}.pdf"); out = fitz.open()
       mat = fitz.Matrix(150/72, 150/72)
       for p in doc:
           out.new_page(width=p.rect.width, height=p.rect.height).insert_image(p.rect, stream=p.get_pixmap(matrix=mat).tobytes("jpeg", jpg_quality=75))
       out.save(f"references/portfolios/{slug}.pdf", deflate=True, garbage=4)
   PY
   ```
   (Requires `pip install pymupdf`. The compressed copies are committed; the 40 MB originals are gitignored.)
2. **Run `supabase/schema.sql`** in the Supabase SQL editor — creates the `sector-assets` bucket + public-read policy (and `app_settings` if not present).
3. **Seed the PDFs** (uploads the compressed copies + writes the mapping): `npm run seed:pdfs`. Or upload each from the Sector Playbooks tab.
4. **Wire the send webhook**: import `references/Campaign Send Automation.json` into n8n, set its Gmail credential, activate, and set its Production URL as `N8N_CAMPAIGN_WEBHOOK_URL` (or the Integrations campaign webhook). Add a Header Auth credential (`x-apmg-secret` = `N8N_WEBHOOK_SECRET`).

Max upload is 15 MB per PDF (kept under Gmail's 25 MB cap after base64 inflation).
