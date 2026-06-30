"use client";

import { useMemo, useState } from "react";
import { CircleCheck, Globe, Mail, Phone, Sparkles, Star, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SALES_REP, type SalesLead, type SalesStatus } from "@/lib/data/sales";
import { formatUsd } from "@/lib/format";
import { Can } from "@/components/rbac/Can";
import { CloseDealModal } from "./CloseDealModal";
import { Footer } from "./Footer";
import { Reveal } from "./Reveal";
import { useSales } from "./SalesProvider";

const STATUS: Record<SalesStatus, { label: string; className: string }> = {
  new: { label: "New", className: "border-border bg-muted text-muted-foreground" },
  contacted: { label: "Contacted", className: "border-primary/40 bg-transparent text-primary" },
  closed_won: { label: "Closed", className: "border-transparent bg-primary-solid text-primary-foreground" },
  closed_lost: {
    label: "Lost",
    className: "border-border bg-transparent text-muted-foreground line-through decoration-muted-foreground/40",
  },
};

const FILTERS: { id: SalesStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "closed_won", label: "Closed" },
  { id: "closed_lost", label: "Lost" },
];

function StatusPill({ status }: { status: SalesStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex-1 px-4 py-3">
      <div
        className={cn(
          "tnum font-mono text-lg font-semibold sm:text-xl",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  onContacted,
  onLost,
  onRequestClose,
}: {
  lead: SalesLead;
  onContacted: (id: string) => void;
  onLost: (id: string) => void;
  onRequestClose: (id: string) => void;
}) {
  const hot = lead.score >= 85;
  const closed = lead.status === "closed_won" || lead.status === "closed_lost";

  return (
    <div className="flex h-full flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold text-foreground">{lead.business}</h3>
          <div className="mt-0.5 truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            {lead.category} · {lead.location}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={lead.status} />
          <span className="tnum inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
            <Star className="h-3 w-3" aria-hidden />
            {lead.rating.toFixed(1)} · {lead.reviews}
          </span>
        </div>
      </div>

      {/* score + engagement */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="tnum inline-flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground">
          {hot && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
          fit {lead.score}
        </span>
        {lead.engaged ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-transparent px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Engaged
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Email sent
          </span>
        )}
      </div>

      {/* contact details — everything the rep needs to call */}
      <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-lg border border-border bg-background/40 p-2.5 sm:grid-cols-2">
        <a
          href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`}
          data-track="lead_call"
          data-track-lead={lead.id}
          className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 font-mono text-[12px] text-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {lead.phone}
        </a>
        <a
          href={`mailto:${lead.email}`}
          data-track="lead_email"
          data-track-lead={lead.id}
          className="inline-flex items-center gap-2 truncate rounded-md px-1.5 py-1 font-mono text-[12px] text-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{lead.email}</span>
        </a>
        <a
          href={`https://${lead.website}`}
          target="_blank"
          rel="noreferrer"
          data-track="lead_website"
          data-track-lead={lead.id}
          className="inline-flex items-center gap-2 truncate rounded-md px-1.5 py-1 font-mono text-[12px] text-foreground transition-colors hover:bg-muted hover:text-primary sm:col-span-2"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{lead.website}</span>
        </a>
      </div>

      {/* AI brief */}
      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" aria-hidden />
          <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-primary">
            AI brief
          </span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-foreground/90">{lead.aiSummary}</p>
        {lead.talkingPoints.length > 0 && (
          <ul className="mt-2 space-y-1">
            {lead.talkingPoints.map((point) => (
              <li key={point} className="flex gap-2 text-[11.5px] leading-snug text-muted-foreground">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {point}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="tnum font-mono text-[11px] text-muted-foreground">
          {lead.status === "closed_won"
            ? "Closed "
            : lead.status === "closed_lost"
              ? "Lost"
              : "Est. "}
          {lead.status !== "closed_lost" && (
            <span className="text-foreground">{formatUsd(lead.closedValue ?? lead.dealValue)}</span>
          )}
        </span>
        <span aria-hidden className="text-border">·</span>
        <span className="font-mono text-[11px] text-muted-foreground">{lead.assignedRep}</span>

        {!closed && (
          <div className="ml-auto flex items-center gap-1.5">
            <Can perm="leads.contact">
              {lead.status === "new" && (
                <button
                  type="button"
                  onClick={() => onContacted(lead.id)}
                  data-track="lead_mark_contacted"
                  data-track-lead={lead.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  Mark contacted
                </button>
              )}
            </Can>
            <Can perm="leads.close">
              <button
                type="button"
                onClick={() => onRequestClose(lead.id)}
                data-track="lead_open_close_modal"
                data-track-lead={lead.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-solid px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary-solid/90"
              >
                <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                Closed
              </button>
              <button
                type="button"
                onClick={() => onLost(lead.id)}
                aria-label={`Mark ${lead.business} lost`}
                data-track="lead_close_lost"
                data-track-lead={lead.id}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </Can>
          </div>
        )}
        {lead.status === "closed_won" && (
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-primary">
            <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            Closed by {lead.assignedRep}
          </span>
        )}
      </div>
    </div>
  );
}

export function SalesPage() {
  const { leads, markContacted, markLost, closeDeal } = useSales();
  const [filter, setFilter] = useState<SalesStatus | "all">("all");
  const [closingId, setClosingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const open = leads.filter((l) => l.status === "new" || l.status === "contacted").length;
    const engaged = leads.filter((l) => l.engaged && l.status !== "closed_lost").length;
    const won = leads.filter((l) => l.status === "closed_won");
    const wonValue = won.reduce((sum, l) => sum + (l.closedValue ?? l.dealValue), 0);
    return { open, engaged, won: won.length, wonValue };
  }, [leads]);

  const visible = filter === "all" ? leads : leads.filter((l) => l.status === filter);
  const closingLead = closingId ? leads.find((l) => l.id === closingId) ?? null : null;

  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:px-6">
      {/* header */}
      <Reveal className="mb-5" y={6}>
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sales desk
          </div>
          <h1 className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-xl">
            Your qualified queue
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Leads admin marked qualified and emailed — ready to call, with an AI brief on each. ·{" "}
            <span className="text-foreground/80">{SALES_REP}</span>
          </p>
        </div>
      </Reveal>

      {/* score tally */}
      <Reveal delay={0.04}>
        <div className="grid grid-cols-2 divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:flex sm:divide-x [&>*]:border-border [&>:nth-child(-n+2)]:border-b sm:[&>*]:border-b-0 [&>:nth-child(odd)]:border-r sm:[&>:nth-child(odd)]:border-r">
          <Stat label="Open in queue" value={String(stats.open)} />
          <Stat label="Engaged" value={String(stats.engaged)} accent />
          <Stat label="Closed" value={String(stats.won)} />
          <Stat label="Closed value · 30d" value={formatUsd(stats.wonValue)} accent />
        </div>
      </Reveal>

      {/* filter */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter leads by status">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            data-track="sales_filter"
            data-track-status={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
              filter === f.id
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* queue */}
      {visible.length === 0 ? (
        <div className="mt-3 flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">No leads here</p>
            <p className="mt-1 text-xs text-muted-foreground">Nothing matches this filter right now.</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {visible.map((lead, i) => (
            <Reveal key={lead.id} delay={0.06 + 0.03 * i} className="h-full">
              <LeadCard
                lead={lead}
                onContacted={markContacted}
                onLost={markLost}
                onRequestClose={setClosingId}
              />
            </Reveal>
          ))}
        </div>
      )}

      <Footer />

      <CloseDealModal
        lead={closingLead}
        onCancel={() => setClosingId(null)}
        onConfirm={(input) => {
          if (closingId) closeDeal(closingId, input);
          setClosingId(null);
        }}
      />
    </div>
  );
}
