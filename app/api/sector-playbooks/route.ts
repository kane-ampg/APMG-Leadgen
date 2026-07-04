import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sameOrigin, supabaseTarget } from "@/lib/pipeline/server";
import { loadPlaybooks, playbookPdfUrl, savePlaybooks } from "@/lib/pipeline/sectorStore";
import { isSectorSlug, kbFileName, mergePlaybooks, type SectorPlaybook } from "@/lib/pipeline/sectors";

// Sector Playbooks config API (Sector Playbooks tab). GET returns each sector's
// category keywords, attachment PDF (public URL), and knowledge-base status;
// POST patches one sector's name/category keywords. The PDF bytes are handled by
// the sibling /pdf route. Server-side (keeps the service role key off the
// browser). Mapping persists in app_settings["sector_playbooks"].
//
// SECURITY — TODO before exposing publicly: same-origin (CSRF) floor only, NOT
// real auth; gate on `playbooks.manage` here once auth lands (this decides which
// PDF is attached to outreach and how leads are routed to a sector).
export const runtime = "nodejs";

const KB_PREVIEW_CHARS = 600;
const MAX_CATEGORIES = 40;
const MAX_KEYWORD_LEN = 60;
const MAX_NAME_LEN = 80;

interface KbInfo {
  present: boolean;
  chars: number;
  preview: string;
}

/** Read the sector's KB markdown (source of truth: components/knowledgebase). */
async function readKb(slug: string): Promise<KbInfo> {
  try {
    const path = join(process.cwd(), "components", "knowledgebase", kbFileName(slug));
    const text = await readFile(path, "utf8");
    return { present: true, chars: text.length, preview: text.slice(0, KB_PREVIEW_CHARS) };
  } catch {
    return { present: false, chars: 0, preview: "" };
  }
}

async function enrich(playbooks: SectorPlaybook[]) {
  return Promise.all(
    playbooks.map(async (pb) => ({
      slug: pb.slug,
      name: pb.name,
      categories: pb.categories,
      pdf: pb.pdf
        ? { name: pb.pdf.name, size: pb.pdf.size, uploadedAt: pb.pdf.uploadedAt, url: playbookPdfUrl(pb) }
        : null,
      kb: await readKb(pb.slug),
    })),
  );
}

async function state() {
  const supa = supabaseTarget();
  const playbooks = await loadPlaybooks();
  return {
    ok: true as const,
    mode: supa.state === "ok" ? "live" : "demo",
    canPersist: supa.state === "ok",
    playbooks: await enrich(playbooks),
  };
}

export async function GET(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return Response.json({ ok: false, mode: "demo", playbooks: [], error: "Forbidden." }, { status: 403 });
  }
  return Response.json(await state());
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const slug = typeof b.slug === "string" ? b.slug : "";
  if (!isSectorSlug(slug)) {
    return Response.json({ ok: false, error: "Unknown sector." }, { status: 400 });
  }

  const playbooks = await loadPlaybooks();
  const target = playbooks.find((p) => p.slug === slug);
  if (!target) {
    return Response.json({ ok: false, error: "Unknown sector." }, { status: 400 });
  }

  // Patch name / categories (both optional). Validation is belt-and-suspenders;
  // mergePlaybooks re-sanitizes before persisting.
  if (typeof b.name === "string") {
    const name = b.name.trim().slice(0, MAX_NAME_LEN);
    if (!name) return Response.json({ ok: false, error: "Name can't be empty." }, { status: 400 });
    target.name = name;
  }
  if (Array.isArray(b.categories)) {
    const categories = [
      ...new Set(
        b.categories
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.toLowerCase().trim())
          .filter((x) => x.length > 0 && x.length <= MAX_KEYWORD_LEN),
      ),
    ].slice(0, MAX_CATEGORIES);
    if (categories.length === 0) {
      return Response.json({ ok: false, error: "Add at least one category keyword." }, { status: 400 });
    }
    target.categories = categories;
  }

  const result = await savePlaybooks(mergePlaybooks(playbooks));
  if (result === "demo") {
    return Response.json(
      { ok: false, error: "Connect Supabase to save sector config here." },
      { status: 409 },
    );
  }
  if (result === "missing-table") {
    return Response.json(
      { ok: false, needsMigration: true, error: "Run supabase/schema.sql to create the app_settings table." },
      { status: 422 },
    );
  }
  if (result !== "ok") {
    return Response.json({ ok: false, error: "Couldn't save the sector config." }, { status: 502 });
  }

  return Response.json(await state());
}
