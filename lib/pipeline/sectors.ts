// Sector Playbooks — per-sector config that maps a lead's free-text CSV Category
// to a sector, its attachment PDF (stored in the `sector-assets` Storage bucket),
// and its knowledge-base doc (components/knowledgebase/<slug>.md). Pure and
// framework-free so the client page (SectorPlaybooksPage) and the server routes
// (api/sector-playbooks, campaigns/send) share the same types + matching logic.
//
// Persisted as JSON in app_settings under SETTING_SECTOR_PLAYBOOKS. The PDF
// bytes live in Storage; only the object path + metadata are stored here.

/** The attachment PDF for a sector (object in the sector-assets bucket). */
export interface SectorPdf {
  /** object path within the sector-assets bucket, e.g. "aged-care.pdf" */
  path: string;
  /** original filename, shown in the UI and used as the email attachment name */
  name: string;
  size: number;
  uploadedAt: string;
}

export interface SectorPlaybook {
  /** stable id — also the KB filename base and the Storage path base */
  slug: string;
  /** display name */
  name: string;
  /** lowercased keyword fragments matched against a lead's free-text Category */
  categories: string[];
  /** attachment PDF, or null when none uploaded yet */
  pdf: SectorPdf | null;
}

export const SECTOR_SLUGS = ["aged-care", "early-childhood", "education"] as const;

/** Seed config — the three APMG sectors with sensible category keywords. Stored
 *  overrides (name/categories/pdf) win; see mergePlaybooks. */
export const DEFAULT_PLAYBOOKS: readonly SectorPlaybook[] = [
  {
    slug: "aged-care",
    name: "Aged Care & Health",
    categories: [
      "aged care", "aged-care", "nursing home", "retirement", "aged living",
      "retirement village", "health", "healthcare", "hospital", "medical centre",
      "disability", "ndis",
    ],
    pdf: null,
  },
  {
    slug: "early-childhood",
    name: "Early Childhood / Early Learning",
    categories: [
      "early childhood", "early learning", "childcare", "child care", "child-care",
      "day care", "daycare", "kindergarten", "kindy", "preschool", "pre-school",
      "nursery", "oshc", "long day care",
    ],
    pdf: null,
  },
  {
    slug: "education",
    name: "Education / Schools",
    categories: [
      "education", "school", "primary school", "secondary school", "high school",
      "college", "university", "campus", "tafe", "academy", "grammar",
    ],
    pdf: null,
  },
];

const SLUG_RE = /^[a-z0-9-]{1,40}$/;
export function isSectorSlug(v: unknown): v is string {
  return typeof v === "string" && SLUG_RE.test(v);
}

/** The KB markdown path (repo-relative) for a sector — the source of truth for
 *  the doc that grounds email copy (components/knowledgebase/<slug>.md). */
export function kbFileName(slug: string): string {
  return `${slug}.md`;
}

/**
 * Resolve a lead's free-text Category to a playbook by keyword match. Longest
 * matching keyword wins, so "aged care" beats an incidental "care", and a
 * lead categorised "Primary school" maps to Education. Returns null when
 * nothing matches (the send flow then attaches no PDF).
 */
export function resolveSectorForCategory(
  category: string | null | undefined,
  playbooks: readonly SectorPlaybook[],
): SectorPlaybook | null {
  const c = (category ?? "").toLowerCase().trim();
  if (!c) return null;
  let best: { pb: SectorPlaybook; len: number } | null = null;
  for (const pb of playbooks) {
    for (const kw of pb.categories) {
      const k = kw.toLowerCase().trim();
      if (k && c.includes(k) && (!best || k.length > best.len)) best = { pb, len: k.length };
    }
  }
  return best?.pb ?? null;
}

const MAX_CATEGORIES = 40;
const MAX_KEYWORD_LEN = 60;
const MAX_NAME_LEN = 80;

/** Defensively coerce one stored/posted entry into a clean SectorPlaybook,
 *  keyed to a known default (so slug + identity can't be spoofed/renamed). */
function sanitizeOne(base: SectorPlaybook, raw: unknown): SectorPlaybook {
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Record<string, unknown>;

  const name =
    typeof o.name === "string" && o.name.trim()
      ? o.name.trim().slice(0, MAX_NAME_LEN)
      : base.name;

  const categories = Array.isArray(o.categories)
    ? [
        ...new Set(
          o.categories
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.toLowerCase().trim())
            .filter((x) => x.length > 0 && x.length <= MAX_KEYWORD_LEN),
        ),
      ].slice(0, MAX_CATEGORIES)
    : [...base.categories];

  let pdf: SectorPdf | null = null;
  const p = o.pdf;
  if (p && typeof p === "object") {
    const po = p as Record<string, unknown>;
    const path = typeof po.path === "string" ? po.path.trim() : "";
    const pname = typeof po.name === "string" ? po.name.trim() : "";
    if (path && pname) {
      pdf = {
        path: path.slice(0, 200),
        name: pname.slice(0, 200),
        size: typeof po.size === "number" && po.size >= 0 ? po.size : 0,
        uploadedAt:
          typeof po.uploadedAt === "string" && po.uploadedAt ? po.uploadedAt : "",
      };
    }
  }

  return { slug: base.slug, name, categories: categories.length ? categories : [...base.categories], pdf };
}

/**
 * Merge stored config over DEFAULT_PLAYBOOKS: the sector set is fixed by the
 * defaults (so new default sectors appear automatically and unknown stored
 * slugs are dropped), while a matching stored entry's name/categories/pdf win.
 */
export function mergePlaybooks(stored: unknown): SectorPlaybook[] {
  const bySlug = new Map<string, unknown>();
  if (Array.isArray(stored)) {
    for (const e of stored) {
      if (e && typeof e === "object" && isSectorSlug((e as Record<string, unknown>).slug)) {
        bySlug.set((e as Record<string, unknown>).slug as string, e);
      }
    }
  }
  return DEFAULT_PLAYBOOKS.map((base) => sanitizeOne(base, bySlug.get(base.slug)));
}

/** Parse the raw app_settings JSON string into playbooks (defaults on any miss). */
export function parsePlaybooks(raw: string | null): SectorPlaybook[] {
  if (!raw) return mergePlaybooks(null);
  try {
    return mergePlaybooks(JSON.parse(raw));
  } catch {
    return mergePlaybooks(null);
  }
}
