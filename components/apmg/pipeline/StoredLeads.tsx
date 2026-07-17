"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Database,
  Folder,
  Globe,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { MAX_FIND_LEADS } from "@/lib/pipeline/campaign";
import { Button } from "@/components/ui/button";
import { ErrorInline, LeadsTableView, TableSkeleton, type LeadView } from "./LeadsTable";
import { LeadDetail } from "./LeadDetail";
import { LeadsExportMenu } from "./LeadsExport";

const EASE = [0.16, 1, 0.3, 1] as const;

// keep in sync with UNGROUPED in lib/pipeline/server.ts
const UNGROUPED = "__ungrouped__";

interface BatchSummary {
  batch: string;
  count: number;
  created: string | null;
}

function folderLabel(batch: string): string {
  return batch === UNGROUPED ? "Ungrouped" : batch;
}

// Mirror of safeBatchName in lib/pipeline/server.ts — the server is the source
// of truth, this just gives instant client-side feedback.
const BATCH_RE = /^[\w.-]{1,80}$/;

/** PATCH a folder rename. Returns null on success, else a user-facing message. */
async function renameFolder(oldBatch: string, next: string): Promise<string | null> {
  const trimmed = next.trim();
  if (!trimmed) return "Enter a folder name.";
  if (!BATCH_RE.test(trimmed)) return "Use letters, numbers, dots, dashes or underscores (max 80).";
  if (trimmed === oldBatch) return null; // no-op, treat as success
  try {
    const res = await fetch("/api/pipeline/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: oldBatch, newBatch: trimmed }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; conflict?: boolean }
      | null;
    if (!res.ok || !data?.ok) return data?.error ?? `Rename failed (${res.status}).`;
    return null;
  } catch {
    return "Network error during rename.";
  }
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Folder browser: the import "folders" (one per upload). Browse folders, open
 * one to multi-select / delete / view its leads. Before the folders migration
 * it degrades to a flat all-leads list (still searchable + deletable + viewable).
 */
export function StoredLeadsPanel({
  refreshSignal,
  openBatch,
  banner,
}: {
  refreshSignal: number;
  openBatch?: string | null;
  banner?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(openBatch ?? null);
  const [localRefresh, setLocalRefresh] = useState(0);

  // a fresh import deep-links into the folder it just created
  useEffect(() => {
    if (openBatch) setOpen(openBatch);
  }, [openBatch]);

  return (
    <div className="flex flex-col gap-4">
      {banner}
      {open !== null ? (
        <FolderDetail
          batch={open}
          refreshKey={refreshSignal + localRefresh}
          onBack={() => setOpen(null)}
          onChanged={() => setLocalRefresh((n) => n + 1)}
          onRenamed={(next) => {
            setOpen(next);
            setLocalRefresh((n) => n + 1);
          }}
        />
      ) : (
        <FoldersView refreshKey={refreshSignal + localRefresh} onOpen={setOpen} />
      )}
    </div>
  );
}

/* ─────────────────────────  selectable table (shared)  ───────────────────── */

/** Search + multi-select-delete + per-row View, over a given set of rows.
 *  Calls onChanged after a successful delete so the parent can refetch. */
function SelectableLeads({
  rows,
  onChanged,
  emptyHint,
  exportScope,
}: {
  rows: LeadView[];
  onChanged: () => void;
  emptyHint: string;
  /** Scope label for exports — the open folder's name, or "All leads". */
  exportScope: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<LeadView | null>(null);
  // Find emails run over the No email section (n8n Email Finder)
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);

  // drop selected ids that no longer exist (after a refresh)
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          (r.website ?? "").toLowerCase().includes(term) ||
          (r.phone ?? "").toLowerCase().includes(term) ||
          (r.address ?? "").toLowerCase().includes(term),
      )
    : rows;

  // Leads split by whether they carry a stored address: no-email leads are
  // excluded from campaigns (Send Campaigns only lists leads with an email),
  // so they get their own section here — with Find emails to recover them.
  const withEmail = filtered.filter((r) => (r.emails?.length ?? 0) > 0);
  const noEmail = filtered.filter((r) => (r.emails?.length ?? 0) === 0);
  // no-email leads the Email Finder can work on: it scrapes the lead's website.
  // A multi-selection narrows the run to just the checked leads; with nothing
  // checked in this section, the whole section is tried.
  const findable = noEmail.filter((r) => r.id && r.website);
  const selectedFindable = findable.filter((r) => selected.has(r.id!));
  const findTargets = selectedFindable.length > 0 ? selectedFindable : findable;

  // export exactly what's on screen: checked rows if any, else the filtered view
  const exportRows =
    selected.size > 0 ? filtered.filter((r) => r.id && selected.has(r.id)) : filtered;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // select-all is per table section (With email / No email / single list)
  function toggleAllOf(section: LeadView[]) {
    setSelected((prev) => {
      const ids = section.map((r) => r.id).filter((x): x is string => !!x);
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }
  const selectionFor = (section: LeadView[]) => ({
    selected,
    onToggle: toggle,
    onToggleAll: () => toggleAllOf(section),
    // enables click + drag selection on the rows
    onSelectMany: setSelected,
  });

  // "Find emails" — POST the no-email leads that have a website (the checked
  // ones if any, else the whole section) to the n8n Email Finder (same route
  // Send Campaigns used to call). Found addresses are persisted onto the lead
  // rows server-side; onChanged() refetches, so the newly-addressed leads move
  // up into the With email section.
  async function findEmails() {
    const batch = findTargets
      .slice(0, MAX_FIND_LEADS)
      .map((r) => ({ id: r.id!, website: r.website! }));
    if (batch.length === 0 || finding) return;
    setFinding(true);
    setFindNote(null);
    setFindError(null);
    try {
      const res = await fetch("/api/pipeline/campaigns/find-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: batch }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; mode?: "live" | "demo" | "noop"; found?: number; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setFindError(data?.error ?? `The email finder responded ${res.status}.`);
        return;
      }
      if (data.mode === "demo") {
        setFindNote("The Email Finder automation isn't connected — add its webhook on the Integrations tab, then try again.");
        return;
      }
      const found = data.found ?? 0;
      setFindNote(
        `Found addresses for ${found.toLocaleString("en-US")} of ${batch.length.toLocaleString("en-US")} lead${batch.length === 1 ? "" : "s"}.${
          found < batch.length ? " The rest had nothing scrapable." : ""
        }`,
      );
      onChanged();
    } catch {
      setFindError("Network error reaching the email finder.");
    } finally {
      setFinding(false);
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline/leads?ids=${ids.join(",")}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Delete failed (${res.status}).`);
        return;
      }
      setSelected(new Set());
      setConfirming(false);
      onChanged();
    } catch {
      setError("Network error during delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            aria-label="Search leads"
            data-track="leads_search"
            className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && !confirming && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirming(true)}
              data-track="leads_delete_selected"
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete {selected.size} selected
            </Button>
          )}
          <LeadsExportMenu rows={exportRows} scope={exportScope} selectionCount={selected.size} />
        </div>
      </div>

      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/[0.04] px-3 py-2">
          <Trash2 className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span className="text-[12px] text-foreground">
            Permanently delete {selected.size} selected lead{selected.size === 1 ? "" : "s"} from Supabase?
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteSelected}
              disabled={deleting}
              data-track="leads_delete_confirm"
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="font-mono text-[11px] text-destructive">
          {error}
        </p>
      )}

      {noEmail.length === 0 ? (
        // no split needed: every lead has an address (or the list is empty)
        <LeadsTableView
          rows={filtered}
          selection={selectionFor(filtered)}
          onView={setViewing}
          emptyHint={term ? `No leads match “${q.trim()}”.` : emptyHint}
        />
      ) : (
        <>
          {withEmail.length > 0 && (
            <>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                With email · {withEmail.length.toLocaleString("en-US")}
              </div>
              <LeadsTableView
                rows={withEmail}
                selection={selectionFor(withEmail)}
                onView={setViewing}
                emptyHint=""
              />
            </>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              No email · {noEmail.length.toLocaleString("en-US")}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              left out of campaigns until an address is found
            </span>
            {findable.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                data-track="leads_find_emails"
                disabled={finding}
                onClick={() => void findEmails()}
                className="ml-auto gap-1.5"
              >
                {finding ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Globe className="h-3.5 w-3.5" aria-hidden />
                )}
                {finding
                  ? "Finding emails…"
                  : `Find emails (${Math.min(findTargets.length, MAX_FIND_LEADS).toLocaleString("en-US")}${
                      selectedFindable.length > 0 ? " selected" : ""
                    })`}
              </Button>
            )}
          </div>
          {findError && (
            <p role="alert" className="font-mono text-[11px] text-destructive">
              {findError}
            </p>
          )}
          {!findError && findNote && (
            <p className="font-mono text-[11px] text-muted-foreground">{findNote}</p>
          )}
          <LeadsTableView
            rows={noEmail}
            selection={selectionFor(noEmail)}
            onView={setViewing}
            emptyHint=""
          />
        </>
      )}

      {viewing && <LeadDetail lead={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* ─────────────────────────────  folder list  ───────────────────────────── */

type FoldersState =
  | { status: "loading" }
  | { status: "error"; error: string; needsMigration?: boolean }
  | { status: "ready"; batches: BatchSummary[]; mode: string };

function FoldersView({
  refreshKey,
  onOpen,
}: {
  refreshKey: number;
  onOpen: (batch: string) => void;
}) {
  const [state, setState] = useState<FoldersState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/pipeline/batches", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; batches?: BatchSummary[]; mode?: string; error?: string; needsMigration?: boolean }
        | null;
      if (data?.needsMigration) {
        setState({ status: "error", error: data.error ?? "Migration needed.", needsMigration: true });
        return;
      }
      if (!res.ok || !data?.ok) {
        setState({ status: "error", error: data?.error ?? `Couldn't load folders (${res.status}).` });
        return;
      }
      setState({ status: "ready", batches: data.batches ?? [], mode: data.mode ?? "live" });
    } catch {
      setState({ status: "error", error: "Network error loading folders." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Before the folders migration: guide the migration, but still show every lead
  // in a flat, fully manageable list.
  if (state.status === "error" && state.needsMigration) {
    return (
      <div className="flex flex-col gap-4">
        <MigrationCard />
        <FlatLeads />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
            <Database className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">Folders</div>
            <div className="font-mono text-[10.5px] text-muted-foreground">
              public.leads
              {state.status === "ready" ? ` · ${state.batches.length} folder${state.batches.length === 1 ? "" : "s"}` : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          data-track="folders_refresh"
          aria-label="Refresh folders"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", state.status === "loading" && "animate-spin")} aria-hidden />
          Refresh
        </button>
      </div>

      {state.status === "loading" && <TableSkeleton />}
      {state.status === "error" && <ErrorInline message={state.error} onRetry={load} />}
      {state.status === "ready" &&
        (state.batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
              <Upload className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-[13px] font-medium text-foreground">No folders yet</p>
            <p className="max-w-xs font-mono text-[10.5px] leading-relaxed text-muted-foreground">
              Each CSV import becomes a folder (leads-0001-…). Run an import from the Pipeline tab.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {state.batches.map((b) => (
              <FolderCard key={b.batch} batch={b} onOpen={onOpen} onDeleted={load} onRenamed={load} />
            ))}
          </div>
        ))}
    </div>
  );
}

/** One folder tile in the grid. Opens the folder on click; the trash button
 *  (revealed on hover/focus) slides a delete confirmation in over the card so a
 *  stray click can't wipe a whole import. Confirm → DELETE the batch. */
function FolderCard({
  batch,
  onOpen,
  onDeleted,
  onRenamed,
}: {
  batch: BatchSummary;
  onOpen: (batch: string) => void;
  onDeleted: () => void;
  onRenamed: () => void;
}) {
  const reduce = !!useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(batch.batch);
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const canRename = batch.batch !== UNGROUPED;

  function startRename() {
    setName(batch.batch);
    setRenameError(null);
    setRenaming(true);
  }

  async function saveRename() {
    setSavingName(true);
    setRenameError(null);
    const err = await renameFolder(batch.batch, name);
    if (err) {
      setRenameError(err);
      setSavingName(false);
      return;
    }
    setRenaming(false);
    setSavingName(false);
    onRenamed(); // reloads the folder list, which unmounts/remounts this card
  }

  async function del() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline/leads?batch=${encodeURIComponent(batch.batch)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Delete failed (${res.status}).`);
        setDeleting(false);
        return;
      }
      onDeleted(); // reloads the folder list, which unmounts this card
    } catch {
      setError("Network error during delete.");
      setDeleting(false);
    }
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-background/40 transition-colors",
        confirming
          ? "border-destructive/50"
          : "border-border hover:border-primary/40 hover:bg-muted/40 focus-within:border-primary/40",
      )}
    >
      {/* base: the openable folder — always mounted so the card keeps its size,
          letting the confirm controls slide in over it with no layout shift */}
      <div
        className={cn(
          "flex items-center gap-1 pl-3 pr-2",
          (confirming || renaming) && "pointer-events-none",
        )}
      >
        <button
          type="button"
          onClick={() => onOpen(batch.batch)}
          aria-hidden={confirming || renaming}
          tabIndex={confirming || renaming ? -1 : undefined}
          data-track="folder_open"
          data-track-batch={batch.batch}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left focus-visible:outline-none"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
            <Folder className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[12px] text-foreground">{folderLabel(batch.batch)}</div>
            <div className="tnum font-mono text-[10px] text-muted-foreground">
              {batch.count.toLocaleString("en-US")} lead{batch.count === 1 ? "" : "s"} · {fmtWhen(batch.created)}
            </div>
          </div>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden
          />
        </button>
        {canRename && (
          <button
            type="button"
            onClick={startRename}
            aria-label={`Rename ${folderLabel(batch.batch)} folder`}
            tabIndex={confirming || renaming ? -1 : undefined}
            data-track="folder_rename"
            data-track-batch={batch.batch}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${folderLabel(batch.batch)} folder`}
          tabIndex={confirming || renaming ? -1 : undefined}
          data-track="folder_delete"
          data-track-batch={batch.batch}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {/* rename overlay: slides in over the card (same footprint) with an inline
          input. Enter/✓ saves, Esc/✕ cancels. */}
      <AnimatePresence>
        {renaming && (
          <motion.div
            className="absolute inset-0 z-10 overflow-hidden rounded-lg"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: "18%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: "18%" }}
            transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
          >
            <div className="absolute inset-0 bg-card" aria-hidden />
            <div
              className="absolute inset-0 rounded-lg bg-primary/[0.05] ring-1 ring-inset ring-primary/40"
              aria-hidden
            />
            <div className="relative flex h-full items-center gap-2 px-3">
              <Pencil className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <input
                type="text"
                value={name}
                autoFocus
                disabled={savingName}
                onChange={(e) => {
                  setName(e.target.value);
                  if (renameError) setRenameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveRename();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setRenaming(false);
                    setRenameError(null);
                  }
                }}
                aria-label="New folder name"
                aria-invalid={!!renameError}
                title={renameError ?? undefined}
                data-track="folder_rename_input"
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-[12px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  renameError ? "border-destructive" : "border-border",
                )}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRenaming(false);
                  setRenameError(null);
                }}
                disabled={savingName}
                aria-label="Cancel rename"
                className="shrink-0 px-2"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                size="sm"
                onClick={() => void saveRename()}
                disabled={savingName}
                data-track="folder_rename_save"
                data-track-batch={batch.batch}
                aria-label="Save folder name"
                className="shrink-0 gap-1.5 px-2"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {savingName ? "Saving…" : "Save"}
              </Button>
            </div>
            {renameError && (
              <span
                role="alert"
                className="pointer-events-none absolute inset-x-3 bottom-0.5 truncate font-mono text-[10px] text-destructive"
              >
                {renameError}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* confirm overlay: slides in over the card (same footprint), revealing
          Cancel + Delete. Solid bg hides the base; destructive ring carries tone. */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            className="absolute inset-0 z-10 overflow-hidden rounded-lg"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: "18%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: "18%" }}
            transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
          >
            {/* opaque backing hides the folder beneath; destructive wash + ring on top */}
            <div className="absolute inset-0 bg-card" aria-hidden />
            <div
              className="absolute inset-0 rounded-lg bg-destructive/[0.06] ring-1 ring-inset ring-destructive/50"
              aria-hidden
            />
            <div className="relative flex h-full items-center gap-2 px-3">
              <Trash2 className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <span
                role={error ? "alert" : undefined}
                title={error ?? undefined}
                className={cn(
                  "min-w-0 flex-1 truncate text-[12px]",
                  error ? "text-destructive" : "text-foreground",
                )}
              >
                {error ?? "Delete this folder?"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={del}
                disabled={deleting}
                data-track="folder_delete_confirm"
                data-track-batch={batch.batch}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────  folder detail  ───────────────────────────── */

type DetailState =
  | { status: "loading" }
  | { status: "error"; error: string; needsMigration?: boolean }
  | { status: "ready"; rows: LeadView[] };

function FolderDetail({
  batch,
  refreshKey,
  onBack,
  onChanged,
  onRenamed,
}: {
  batch: string;
  refreshKey: number;
  onBack: () => void;
  onChanged: () => void;
  onRenamed: (next: string) => void;
}) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [folderConfirm, setFolderConfirm] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(batch);
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const canRename = batch !== UNGROUPED;

  async function saveRename() {
    setSavingName(true);
    setRenameError(null);
    const err = await renameFolder(batch, name);
    if (err) {
      setRenameError(err);
      setSavingName(false);
      return;
    }
    setRenaming(false);
    setSavingName(false);
    onRenamed(name.trim());
  }

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setFolderConfirm(false);
    try {
      const res = await fetch(`/api/pipeline/leads?batch=${encodeURIComponent(batch)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; rows?: LeadView[]; error?: string; needsMigration?: boolean }
        | null;
      if (data?.needsMigration) {
        setState({ status: "error", error: data.error ?? "Migration needed.", needsMigration: true });
        return;
      }
      if (!res.ok || !data?.ok) {
        setState({ status: "error", error: data?.error ?? `Couldn't load this folder (${res.status}).` });
        return;
      }
      setState({ status: "ready", rows: data.rows ?? [] });
    } catch {
      setState({ status: "error", error: "Network error loading this folder." });
    }
  }, [batch]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const rows = state.status === "ready" ? state.rows : [];

  // after a row-level delete: refresh counts upstream, reload, and exit if empty
  async function handleChanged() {
    onChanged();
    try {
      const res = await fetch(`/api/pipeline/leads?batch=${encodeURIComponent(batch)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; rows?: LeadView[] } | null;
      if (data?.ok) {
        if ((data.rows?.length ?? 0) === 0) onBack();
        else setState({ status: "ready", rows: data.rows ?? [] });
      } else {
        load();
      }
    } catch {
      load();
    }
  }

  async function deleteFolder() {
    setDeletingFolder(true);
    try {
      const res = await fetch(`/api/pipeline/leads?batch=${encodeURIComponent(batch)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setState({ status: "error", error: data?.error ?? `Delete failed (${res.status}).` });
        return;
      }
      onChanged();
      onBack();
    } catch {
      setState({ status: "error", error: "Network error during delete." });
    } finally {
      setDeletingFolder(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* folder header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} data-track="folder_back" className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Folders
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
            <Folder className="h-4 w-4" aria-hidden />
          </span>
          {renaming ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={name}
                  autoFocus
                  disabled={savingName}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (renameError) setRenameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenaming(false);
                      setRenameError(null);
                    }
                  }}
                  aria-label="New folder name"
                  aria-invalid={!!renameError}
                  data-track="folder_rename_input"
                  className={cn(
                    "h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    renameError ? "border-destructive" : "border-border",
                  )}
                />
                <Button
                  size="sm"
                  onClick={() => void saveRename()}
                  disabled={savingName}
                  data-track="folder_rename_save"
                  data-track-batch={batch}
                  className="shrink-0 gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {savingName ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRenaming(false);
                    setRenameError(null);
                  }}
                  disabled={savingName}
                  className="shrink-0"
                >
                  Cancel
                </Button>
              </div>
              {renameError && (
                <span role="alert" className="font-mono text-[10.5px] text-destructive">
                  {renameError}
                </span>
              )}
            </div>
          ) : (
            <div className="min-w-0">
              <div className="truncate font-mono text-[12.5px] font-semibold text-foreground">
                {folderLabel(batch)}
              </div>
              <div className="tnum font-mono text-[10.5px] text-muted-foreground">
                {state.status === "ready" ? `${rows.length.toLocaleString("en-US")} leads` : "loading…"}
              </div>
            </div>
          )}
        </div>
        {!renaming && !folderConfirm && (
          <div className="ml-auto flex items-center gap-2">
            {canRename && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setName(batch);
                  setRenameError(null);
                  setRenaming(true);
                }}
                data-track="folder_rename"
                data-track-batch={batch}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Rename
              </Button>
            )}
            {state.status === "ready" && rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFolderConfirm(true)}
                data-track="folder_delete"
                className="gap-1.5 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete folder
              </Button>
            )}
          </div>
        )}
      </div>

      {folderConfirm && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/[0.04] px-3 py-2">
          <Trash2 className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span className="text-[12px] text-foreground">
            Permanently delete the entire “{folderLabel(batch)}” folder ({rows.length} lead
            {rows.length === 1 ? "" : "s"})?
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFolderConfirm(false)} disabled={deletingFolder}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteFolder}
              disabled={deletingFolder}
              data-track="folder_delete_confirm"
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {deletingFolder ? "Deleting…" : "Delete folder"}
            </Button>
          </div>
        </div>
      )}

      {state.status === "loading" && <TableSkeleton />}
      {state.status === "error" &&
        (state.needsMigration ? <MigrationCard /> : <ErrorInline message={state.error} onRetry={load} />)}
      {state.status === "ready" && (
        <SelectableLeads
          rows={rows}
          onChanged={handleChanged}
          emptyHint="This folder is empty."
          exportScope={folderLabel(batch)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────  flat fallback  ───────────────────────────── */

type FlatState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; rows: LeadView[]; total: number };

function FlatLeads() {
  const [state, setState] = useState<FlatState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/pipeline/leads", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; rows?: LeadView[]; total?: number; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setState({ status: "error", error: data?.error ?? `Couldn't load leads (${res.status}).` });
        return;
      }
      setState({ status: "ready", rows: data.rows ?? [], total: data.total ?? 0 });
    } catch {
      setState({ status: "error", error: "Network error loading leads." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
            <Database className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">All leads</div>
            <div className="tnum font-mono text-[10.5px] text-muted-foreground">
              public.leads
              {state.status === "ready" ? ` · ${state.total.toLocaleString("en-US")} total` : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          data-track="leads_refresh_all"
          aria-label="Refresh leads"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", state.status === "loading" && "animate-spin")} aria-hidden />
          Refresh
        </button>
      </div>

      {state.status === "loading" && <TableSkeleton />}
      {state.status === "error" && <ErrorInline message={state.error} onRetry={load} />}
      {state.status === "ready" && (
        <SelectableLeads
          rows={state.rows}
          onChanged={load}
          emptyHint="No leads stored yet. Import a CSV from the Pipeline tab."
          exportScope="All leads"
        />
      )}
    </div>
  );
}

/* ─────────────────────────────  migration prompt  ───────────────────────────── */

const MIGRATION_SQL =
  "alter table public.leads add column if not exists batch text;\nalter table public.leads add column if not exists category text;\ncreate index if not exists leads_batch_idx on public.leads (batch);";

/** Shown when the `batch` column is missing — guides the one-time migration. */
export function MigrationCard() {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
          <Database className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground">Enable folders</div>
          <div className="font-mono text-[10.5px] text-muted-foreground">
            One-time: run this in Supabase → SQL Editor to group leads by import
          </div>
        </div>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {MIGRATION_SQL}
      </pre>
    </div>
  );
}
