import { deleteObject, sameOrigin, SECTOR_ASSETS_BUCKET, uploadObject } from "@/lib/pipeline/server";
import { loadPlaybooks, savePlaybooks } from "@/lib/pipeline/sectorStore";
import { isSectorSlug, mergePlaybooks } from "@/lib/pipeline/sectors";

// Upload / remove the attachment PDF for one sector (Sector Playbooks tab). The
// bytes go to the public `sector-assets` Storage bucket at "<slug>.pdf" (upsert,
// so re-uploading replaces); the object metadata is recorded in the
// app_settings["sector_playbooks"] mapping alongside the sector's KB markdown.
// The send flow resolves a lead's Category → this sector → the PDF's public URL
// and passes it to n8n, whose Gmail node downloads + attaches it. Server-side;
// keeps the service role key off the browser.
//
// SECURITY — TODO: same-origin (CSRF) floor only; gate on `playbooks.manage`
// once auth lands.
export const runtime = "nodejs";

// Gmail caps a message at ~25 MB measured on the BASE64-ENCODED MIME payload,
// which inflates raw bytes by ~33%. Cap the raw PDF at 18 MB *decimal*
// (18,000,000 B → ~24 MB encoded) so even a maxed upload clears Gmail with
// headroom for the HTML body — rejected here rather than silently bouncing the
// outreach email. (The raw APMG portfolios are ~36–40 MB — compress them first.)
const MAX_PDF_BYTES = 18 * 1000 * 1000;

function persistError(result: "demo" | "missing-table" | "error"): Response {
  if (result === "demo") {
    return Response.json({ ok: false, error: "Connect Supabase to manage attachment PDFs." }, { status: 409 });
  }
  if (result === "missing-table") {
    return Response.json(
      { ok: false, needsMigration: true, error: "Run supabase/schema.sql to create the app_settings table." },
      { status: 422 },
    );
  }
  return Response.json({ ok: false, error: "Couldn't update the sector config." }, { status: 502 });
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Expected a multipart upload." }, { status: 400 });
  }

  const slug = form.get("slug");
  if (typeof slug !== "string" || !isSectorSlug(slug)) {
    return Response.json({ ok: false, error: "Unknown sector." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "No file provided." }, { status: 400 });
  }
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    return Response.json({ ok: false, error: "Only PDF files can be attached." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ ok: false, error: "That PDF is empty." }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return Response.json(
      {
        ok: false,
        error: `PDF is too large (max ${(MAX_PDF_BYTES / 1000 / 1000).toFixed(0)} MB — Gmail can't attach more once base64-encoded; compress it first).`,
      },
      { status: 413 },
    );
  }

  const playbooks = await loadPlaybooks();
  const target = playbooks.find((p) => p.slug === slug);
  if (!target) {
    return Response.json({ ok: false, error: "Unknown sector." }, { status: 400 });
  }

  const objectPath = `${slug}.pdf`;
  const bytes = await file.arrayBuffer();
  const uploaded = await uploadObject(SECTOR_ASSETS_BUCKET, objectPath, bytes, "application/pdf");
  if (uploaded === "demo") {
    return Response.json({ ok: false, error: "Connect Supabase to upload attachment PDFs." }, { status: 409 });
  }
  if (uploaded !== "ok") {
    return Response.json(
      { ok: false, error: "Upload failed. Make sure the sector-assets storage bucket exists (run supabase/schema.sql)." },
      { status: 502 },
    );
  }

  target.pdf = {
    path: objectPath,
    name: file.name.slice(0, 200),
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };

  const result = await savePlaybooks(mergePlaybooks(playbooks));
  if (result !== "ok") return persistError(result);

  return Response.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  if (!sameOrigin(req)) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!isSectorSlug(slug)) {
    return Response.json({ ok: false, error: "Unknown sector." }, { status: 400 });
  }

  const playbooks = await loadPlaybooks();
  const target = playbooks.find((p) => p.slug === slug);
  if (!target) {
    return Response.json({ ok: false, error: "Unknown sector." }, { status: 400 });
  }
  if (!target.pdf) {
    return Response.json({ ok: true }); // already none
  }

  // Clear the mapping and persist FIRST, so a failed save never strands
  // app_settings pointing at a file we already deleted. Only once the metadata
  // is gone do we best-effort delete the Storage object (a failed delete just
  // leaves an orphaned object, not a broken reference).
  const path = target.pdf.path;
  target.pdf = null;

  const result = await savePlaybooks(mergePlaybooks(playbooks));
  if (result !== "ok") return persistError(result);

  await deleteObject(SECTOR_ASSETS_BUCKET, path);

  return Response.json({ ok: true });
}
