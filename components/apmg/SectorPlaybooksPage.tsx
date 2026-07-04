"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FileCheck2,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Footer } from "./Footer";
import { Reveal } from "./Reveal";

// Sector Playbooks tab — per-sector config that routes a lead's CSV Category to
// a sector, the portfolio PDF the send flow attaches, and the knowledge-base doc
// that grounds the email copy. Reads/writes /api/sector-playbooks (+ /pdf).

interface PdfView {
  name: string;
  size: number;
  uploadedAt: string;
  url: string | null;
}
interface KbView {
  present: boolean;
  chars: number;
  preview: string;
}
interface PlaybookView {
  slug: string;
  name: string;
  categories: string[];
  pdf: PdfView | null;
  kb: KbView;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; mode: string; canPersist: boolean; playbooks: PlaybookView[] };

const POLL_MS = 20000;

function fmtBytes(n: number): string {
  if (n <= 0) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SectorPlaybooksPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchState = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoad((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const res = await fetch("/api/sector-playbooks", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; mode?: string; canPersist?: boolean; playbooks?: PlaybookView[]; error?: string }
        | null;
      if (!mountedRef.current) return;
      if (!res.ok || !data?.ok) {
        setLoad({ status: "error", error: data?.error ?? `Couldn't load sector playbooks (${res.status}).` });
        return;
      }
      setLoad({
        status: "ready",
        mode: data.mode ?? "live",
        canPersist: data.canPersist ?? false,
        playbooks: data.playbooks ?? [],
      });
    } catch {
      if (mountedRef.current) setLoad({ status: "error", error: "Network error loading sector playbooks." });
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(() => fetchState({ quiet: true }), POLL_MS);
    const onFocus = () => fetchState({ quiet: true });
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchState]);

  const ready = load.status === "ready" ? load : null;
  const withPdf = ready ? ready.playbooks.filter((p) => p.pdf).length : 0;

  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:px-6">
      <Reveal className="mb-5" y={6}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Automation layer
            </div>
            <h1 className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-xl">
              Sector Playbooks
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Each lead is routed to a sector by its <span className="text-foreground/80">Category</span>. The sector&apos;s
              PDF is attached to its outreach email, and its knowledge base grounds the AI-written copy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchState()}
            data-track="playbooks_refresh"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", load.status === "loading" && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
      </Reveal>

      {ready && ready.mode === "demo" && (
        <Reveal delay={0.03}>
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3 ring-1 ring-foreground/10">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Supabase isn&apos;t connected, so changes here won&apos;t persist and PDFs can&apos;t be uploaded. Run{" "}
              <span className="font-mono text-foreground/80">supabase/schema.sql</span> and set the Supabase env vars to
              enable saving.
            </p>
          </div>
        </Reveal>
      )}

      {ready && (
        <Reveal delay={0.04}>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="h-[18px] w-[18px]" aria-hidden />
            </div>
            <div className="text-[12.5px] text-muted-foreground">
              <span className="font-semibold text-foreground">{ready.playbooks.length}</span> sectors ·{" "}
              <span className="font-semibold text-foreground">{withPdf}</span> with an attachment PDF
            </div>
          </div>
        </Reveal>
      )}

      {load.status === "loading" && (
        <div className="mt-1 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl bg-card ring-1 ring-foreground/10" />
          <div className="h-72 animate-pulse rounded-xl bg-card ring-1 ring-foreground/10" />
        </div>
      )}

      {load.status === "error" && (
        <div className="mt-1 flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-card px-6 py-10 text-center ring-1 ring-foreground/10">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <p role="alert" className="max-w-sm font-mono text-[11px] leading-relaxed text-muted-foreground">
            {load.error}
          </p>
          <Button variant="outline" size="sm" onClick={() => fetchState()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </Button>
        </div>
      )}

      {ready && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ready.playbooks.map((pb, i) => (
            <Reveal key={pb.slug} delay={0.06 + 0.04 * i} className="h-full">
              <PlaybookCard playbook={pb} canPersist={ready.canPersist} onChanged={() => fetchState({ quiet: true })} />
            </Reveal>
          ))}
        </div>
      )}

      <Footer />
    </div>
  );
}

function PlaybookCard({
  playbook,
  canPersist,
  onChanged,
}: {
  playbook: PlaybookView;
  canPersist: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(playbook.name);
  const [cats, setCats] = useState<string[]>(playbook.categories);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKb, setShowKb] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset local edit buffers if the upstream data changes while not editing.
  useEffect(() => {
    if (!editing) {
      setName(playbook.name);
      setCats(playbook.categories);
    }
  }, [playbook.name, playbook.categories, editing]);

  function addCat() {
    const c = newCat.toLowerCase().trim();
    if (!c) return;
    setCats((prev) => (prev.includes(c) ? prev : [...prev, c]));
    setNewCat("");
  }

  async function saveConfig() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/sector-playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: playbook.slug, name: name.trim(), categories: cats }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Save failed (${res.status}).`);
        return;
      }
      setEditing(false);
      onChanged();
    } catch {
      setError("Network error saving the sector.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPdf(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("slug", playbook.slug);
      fd.append("file", file);
      const res = await fetch("/api/sector-playbooks/pdf", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      onChanged();
    } catch {
      setError("Network error uploading the PDF.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePdf() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/sector-playbooks/pdf?slug=${encodeURIComponent(playbook.slug)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Remove failed (${res.status}).`);
        return;
      }
      onChanged();
    } catch {
      setError("Network error removing the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/20">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-[14px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Sector name"
            />
          ) : (
            <h3 className="truncate text-[14px] font-semibold text-foreground">{playbook.name}</h3>
          )}
          <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {playbook.slug}
          </div>
        </div>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
            data-track="playbook_edit"
            className="shrink-0 gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </Button>
        )}
      </div>

      {/* category keywords */}
      <div className="mt-3">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Matches Categories
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(editing ? cats : playbook.categories).map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground"
            >
              {c}
              {editing && (
                <button
                  type="button"
                  onClick={() => setCats((prev) => prev.filter((x) => x !== c))}
                  aria-label={`Remove ${c}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </span>
          ))}
          {(editing ? cats : playbook.categories).length === 0 && (
            <span className="text-[11px] text-muted-foreground">No category keywords yet.</span>
          )}
        </div>
        {editing && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCat();
                }
              }}
              placeholder="add keyword (e.g. nursing home)"
              className="h-8 flex-1 rounded-lg border border-border bg-background px-2.5 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button size="sm" variant="outline" onClick={addCat} disabled={!newCat.trim()} className="gap-1">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* attachment PDF */}
      <div className="mt-3 rounded-lg border border-border bg-background/40 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Attachment PDF
          </span>
          {playbook.pdf && (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
              {fmtBytes(playbook.pdf.size)}
            </span>
          )}
        </div>
        {playbook.pdf ? (
          <div className="mt-1.5 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">{playbook.pdf.name}</span>
            {playbook.pdf.url && (
              <a
                href={playbook.pdf.url}
                target="_blank"
                rel="noreferrer"
                data-track="playbook_pdf_view"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                <Download className="h-3 w-3" aria-hidden />
                View
              </a>
            )}
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            No PDF attached — outreach for this sector sends without a portfolio attachment.
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPdf(f);
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={playbook.pdf ? "outline" : "default"}
            disabled={busy || !canPersist}
            onClick={() => fileRef.current?.click()}
            data-track="playbook_pdf_upload"
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {playbook.pdf ? "Replace PDF" : "Upload PDF"}
          </Button>
          {playbook.pdf && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !canPersist}
              onClick={removePdf}
              data-track="playbook_pdf_remove"
              className="gap-1.5 text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* knowledge base (source of truth = repo file, shown read-only) */}
      <div className="mt-3 rounded-lg border border-border bg-background/40 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setShowKb((s) => !s)}
          className="flex w-full items-center justify-between gap-2"
          aria-expanded={showKb}
          data-track="playbook_kb_toggle"
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Knowledge base
            {playbook.kb.present ? (
              <span className="text-primary">· {(playbook.kb.chars / 1000).toFixed(1)}k chars</span>
            ) : (
              <span className="text-destructive">· missing</span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showKb && "rotate-180")} aria-hidden />
        </button>
        {showKb && (
          <div className="mt-2">
            {playbook.kb.present ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                {playbook.kb.preview}
                {playbook.kb.chars > playbook.kb.preview.length ? "\n…" : ""}
              </pre>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No <span className="font-mono text-foreground/80">{playbook.slug}.md</span> found.
              </p>
            )}
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Edit in <span className="text-foreground/80">components/knowledgebase/{playbook.slug}.md</span> — the file is
              the source of truth for the AI email copy.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 font-mono text-[10px] leading-relaxed text-destructive">
          {error}
        </p>
      )}

      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={saveConfig}
            disabled={busy || !canPersist || name.trim().length === 0 || cats.length === 0}
            data-track="playbook_save"
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setName(playbook.name);
              setCats(playbook.categories);
              setNewCat("");
              setError(null);
            }}
          >
            Cancel
          </Button>
          {!canPersist && (
            <span className="font-mono text-[10px] text-muted-foreground">Supabase required to save</span>
          )}
        </div>
      )}
    </div>
  );
}
