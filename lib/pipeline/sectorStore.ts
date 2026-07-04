import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  readSetting,
  writeSetting,
  publicObjectUrl,
  SECTOR_ASSETS_BUCKET,
  SETTING_SECTOR_PLAYBOOKS,
} from "./server";
import { kbFileName, parsePlaybooks, resolveSectorForCategory, type SectorPlaybook } from "./sectors";

// Server-side accessor for the Sector Playbooks config (app_settings JSON).
// Shared by the API routes (read/write from the tab) and the send route (read,
// to attach the matching PDF). Pure model + matching logic live in sectors.ts;
// this module is the DB/storage boundary.

/** Load the merged playbooks (defaults overlaid with saved config). */
export async function loadPlaybooks(): Promise<SectorPlaybook[]> {
  return parsePlaybooks(await readSetting(SETTING_SECTOR_PLAYBOOKS));
}

/** Persist the full playbook array as JSON. Mirrors writeSetting's result. */
export async function savePlaybooks(
  playbooks: SectorPlaybook[],
): Promise<"ok" | "demo" | "missing-table" | "error"> {
  return writeSetting(SETTING_SECTOR_PLAYBOOKS, JSON.stringify(playbooks));
}

/** Public attachment URL for a sector's PDF, or null when none / demo mode. */
export function playbookPdfUrl(pb: SectorPlaybook): string | null {
  return pb.pdf ? publicObjectUrl(SECTOR_ASSETS_BUCKET, pb.pdf.path) : null;
}

const KB_MAX_CHARS = 24000;

/** Read a knowledge-base markdown file (components/knowledgebase/<file>). */
async function readKbFile(file: string): Promise<string> {
  try {
    return await readFile(join(process.cwd(), "components", "knowledgebase", file), "utf8");
  } catch {
    return "";
  }
}

/**
 * Build the knowledge-base context passed to the email composer for a lead:
 * the general company file (business.md) + the file for the sector its Category
 * resolves to. This is what grounds the draft in APMG's real services (property
 * maintenance), so it never writes a generic lead-generation pitch. Empty string
 * only if no KB files are present.
 */
export async function buildComposeKb(
  category: string | null | undefined,
  playbooks: SectorPlaybook[],
): Promise<string> {
  const general = (await readKbFile("business.md")).trim();
  const sector = resolveSectorForCategory(category, playbooks);
  const sectorMd = sector ? (await readKbFile(kbFileName(sector.slug))).trim() : "";
  return [general, sectorMd].filter(Boolean).join("\n\n---\n\n").slice(0, KB_MAX_CHARS);
}
