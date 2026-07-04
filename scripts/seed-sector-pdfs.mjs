// Seed the Sector Playbooks attachment PDFs into Supabase Storage + the mapping.
//
// Uploads references/portfolios/<slug>.pdf to the public `sector-assets` bucket
// and records each as the sector's attachment in app_settings["sector_playbooks"].
// The sector names + category keywords come from lib/pipeline/sectors.ts defaults
// at read time (this seed writes only { slug, pdf }, so it never drifts from them).
//
// Prereqs: run supabase/schema.sql first (creates the bucket), and have
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set (this reads .env.local too).
//
// Usage:  npm run seed:pdfs      (or: node scripts/seed-sector-pdfs.mjs)

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "sector-assets";
const SETTING_KEY = "sector_playbooks";
const SLUGS = ["aged-care", "early-childhood", "education"];

// Minimal .env.local loader (no dependency). Real env vars win.
function loadEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const base = process.env.SUPABASE_URL && new URL(process.env.SUPABASE_URL).origin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them or add to .env.local).");
    process.exit(1);
  }

  const stored = [];
  for (const slug of SLUGS) {
    const file = join(ROOT, "references", "portfolios", `${slug}.pdf`);
    if (!existsSync(file)) {
      console.error(`! ${slug}: ${file} not found — skipping (run the compress step first).`);
      continue;
    }
    const bytes = await readFile(file);
    const objectPath = `${slug}.pdf`;
    const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
        "cache-control": "3600",
      },
      body: bytes,
    });
    if (!up.ok) {
      const detail = await up.text().catch(() => "");
      console.error(`! ${slug}: upload failed ${up.status} — ${detail.slice(0, 200)}`);
      console.error("  (Did you run supabase/schema.sql to create the sector-assets bucket?)");
      continue;
    }
    console.log(`✓ uploaded ${objectPath} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
    stored.push({
      slug,
      pdf: { path: objectPath, name: `APMG ${slug}.pdf`, size: bytes.length, uploadedAt: new Date().toISOString() },
    });
  }

  if (stored.length === 0) {
    console.error("Nothing uploaded — mapping unchanged.");
    process.exit(1);
  }

  const res = await fetch(`${base}/rest/v1/app_settings?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ key: SETTING_KEY, value: JSON.stringify(stored), updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`! mapping upsert failed ${res.status} — ${detail.slice(0, 200)}`);
    console.error("  (Did you run supabase/schema.sql to create app_settings?)");
    process.exit(1);
  }
  console.log(`✓ wrote app_settings["${SETTING_KEY}"] for ${stored.length} sector(s).`);
  console.log("Done. Open the Sector Playbooks tab to confirm the PDFs are attached.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
