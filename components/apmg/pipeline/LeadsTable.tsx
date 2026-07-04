"use client";

import { AlertTriangle, Eye, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { bestEmail } from "@/lib/pipeline/campaign";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** A stored/parsed lead. Table renders a subset; the detail view uses all of it. */
export interface LeadView {
  id?: string;
  name: string;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  rating?: number | string | null;
  category?: string | null;
  emails?: string[] | null;
  social_medias?: string[] | null;
  featured_image?: string | null;
  bing_maps_url?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  batch?: string | null;
  created_at?: string | null;
}

interface Selection {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}

function Dash() {
  return <span className="text-muted-foreground/50">—</span>;
}

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Presentational table for a set of leads. Pass `selection` for a checkbox
 *  column (multi-select delete) and `onView` for a per-row details button. */
export function LeadsTableView({
  rows,
  emptyHint,
  selection,
  onView,
}: {
  rows: LeadView[];
  emptyHint: string;
  selection?: Selection;
  onView?: (row: LeadView) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-6 py-12 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
          <Inbox className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-[13px] font-medium text-foreground">No rows</p>
        <p className="max-w-xs font-mono text-[10.5px] leading-relaxed text-muted-foreground">
          {emptyHint}
        </p>
      </div>
    );
  }

  const selectable = !!selection;
  const selectableRows = rows.filter((r) => r.id);
  const allSelected =
    selectable && selectableRows.length > 0 && selectableRows.every((r) => selection!.selected.has(r.id!));
  const someSelected = selectable && selectableRows.some((r) => selection!.selected.has(r.id!));

  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable && (
              <TableHead className="w-9">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  className="h-3.5 w-3.5 cursor-pointer accent-primary align-middle"
                  checked={!!allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && !!someSelected;
                  }}
                  onChange={selection!.onToggleAll}
                />
              </TableHead>
            )}
            <TableHead>Business</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Rating</TableHead>
            <TableHead className="text-right">Emails</TableHead>
            <TableHead className="text-right">Socials</TableHead>
            {onView && <TableHead className="text-right">Details</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const checked = !!(r.id && selection?.selected.has(r.id));
            const email = bestEmail(r.emails);
            return (
              <TableRow key={r.id ?? i} className={cn("hover:bg-muted/40", checked && "bg-primary/[0.04]")}>
                {selectable && (
                  <TableCell className="w-9">
                    {r.id && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        className="h-3.5 w-3.5 cursor-pointer accent-primary align-middle"
                        checked={checked}
                        onChange={() => selection!.onToggle(r.id!)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="max-w-[260px]">
                  <div className="truncate text-[13px] text-foreground">{r.name}</div>
                  {r.address && (
                    <div className="mt-px truncate font-mono text-[10px] text-muted-foreground">
                      {r.address}
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-[220px]">
                  {r.website ? (
                    <a
                      href={r.website}
                      target="_blank"
                      rel="noreferrer"
                      data-track="lead_website"
                      className="block truncate font-mono text-[11px] text-primary hover:underline"
                    >
                      {prettyUrl(r.website)}
                    </a>
                  ) : (
                    <Dash />
                  )}
                </TableCell>
                <TableCell className="tnum font-mono text-[12px] text-foreground">
                  {r.phone ?? <Dash />}
                </TableCell>
                <TableCell className="max-w-[220px]">
                  {email ? (
                    <a
                      href={`mailto:${email}`}
                      data-track="lead_email"
                      className="block truncate font-mono text-[11px] text-primary hover:underline"
                    >
                      {email}
                    </a>
                  ) : (
                    <Dash />
                  )}
                </TableCell>
                <TableCell className="tnum text-right font-mono text-[12px] text-foreground">
                  {r.rating != null && r.rating !== "" ? r.rating : <Dash />}
                </TableCell>
                <TableCell className="tnum text-right font-mono text-[12px] text-foreground">
                  {r.emails?.length || <Dash />}
                </TableCell>
                <TableCell className="tnum text-right font-mono text-[12px] text-foreground">
                  {r.social_medias?.length || <Dash />}
                </TableCell>
                {onView && (
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => onView(r)}
                      data-track="lead_view"
                      data-track-lead={r.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                      View
                    </button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Shared loading skeleton for the stored-leads views. */
export function TableSkeleton() {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border">
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shared inline error with a retry, used by the stored-leads views. */
export function ErrorInline({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <p role="alert" className="max-w-sm font-mono text-[11px] leading-relaxed text-muted-foreground">
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} data-track="leads_retry" className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Retry
      </Button>
    </div>
  );
}
