"use client";

import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Kpi } from "@/lib/data/leads";
import { useLeadStats, type LeadStatsData } from "@/lib/data/useLeadStats";
import { SALES_REP } from "@/lib/data/sales";
import { formatKpi } from "@/lib/format";
import { useRbac } from "@/lib/rbac/RbacProvider";
import { type Role } from "@/lib/rbac/roles";
import { Button } from "@/components/ui/button";
import { Footer } from "./Footer";
import { KpiCard } from "./KpiCard";
import { LeadsHistogram, type HistogramMode } from "./LeadsHistogram";
import { RecentLeadsTable } from "./RecentLeadsTable";
import { Reveal } from "./Reveal";
import { useSales } from "./SalesProvider";
import { TableSkeleton } from "./pipeline/LeadsTable";

/* ───────────────────────────  per-role copy  ─────────────────────────── */

interface OverviewCopy {
  kicker: string;
  title: string;
  lede: string;
  histogramTitle: string;
  recentTitle: string;
  recentEmpty: string;
  histogramEmpty: string;
}

function copyFor(role: Role): OverviewCopy {
  switch (role) {
    case "client":
      return {
        kicker: "Your leads",
        title: "Delivered leads",
        lede: "Every business we've delivered to you, straight from the pipeline.",
        histogramTitle: "Delivery volume",
        recentTitle: "Recent deliveries",
        recentEmpty: "No leads delivered yet.",
        histogramEmpty: "No deliveries to chart yet.",
      };
    case "sales":
      return {
        kicker: "Sales desk",
        title: "Your overview",
        lede: `From pipeline volume to closed deals — your funnel at a glance. · ${SALES_REP}`,
        histogramTitle: "Lead volume",
        recentTitle: "Latest in pipeline",
        recentEmpty: "No leads in the pipeline yet.",
        histogramEmpty: "No lead volume to chart yet.",
      };
    default:
      return {
        kicker: "Signal overview",
        title: "Lead operations",
        lede: "Live readout of every lead in the pipeline.",
        histogramTitle: "Import volume",
        recentTitle: "Recent imports",
        recentEmpty: "No leads imported yet — run an import from the Pipeline tab.",
        histogramEmpty: "No import volume to chart yet.",
      };
  }
}

/* ───────────────────────────  KPI builders  ─────────────────────────── */

interface SalesStats {
  open: number;
  engaged: number;
  won: number;
  wonValue: number;
  queueTotal: number;
}

const ratio = (count: number, total: number) => (total > 0 ? count / total : 0);

/** Placeholder cards (skeleton readouts) while the pipeline data loads. */
function loadingKpis(role: Role): Kpi[] {
  const labels =
    role === "sales"
      ? ["Pipeline leads", "Open in queue", "Engaged", "Closed · 30d"]
      : role === "client"
        ? ["Delivered leads", "With email", "Avg rating"]
        : ["Total leads", "With email", "With phone", "Avg rating"];
  return labels.map((label, i) => ({
    id: `loading-${i}`,
    label,
    value: "—",
    numeric: 0,
    format: "int",
    loading: true,
  }));
}

function totalCard(d: LeadStatsData, label: string, caption: string): Kpi {
  return {
    id: "total",
    label,
    value: formatKpi(d.total, "int"),
    numeric: d.total,
    format: "int",
    caption,
    spark: d.byDay.map((b) => b.value),
  };
}

function ratingCard(d: LeadStatsData, caption: string): Kpi {
  return {
    id: "rating",
    label: "Avg rating",
    value: d.avgRating != null ? formatKpi(d.avgRating, "rating") : "—",
    numeric: d.avgRating ?? 0,
    format: "rating",
    noCountUp: d.avgRating == null,
    caption: d.ratedCount > 0 ? caption : "no ratings yet",
    ratio: { value: ratio(d.ratedCount, d.total), label: "have a rating" },
  };
}

function countRatioCard(
  id: string,
  label: string,
  count: number,
  total: number,
  ratioLabel: string,
  caption: string,
): Kpi {
  return {
    id,
    label,
    value: formatKpi(count, "int"),
    numeric: count,
    format: "int",
    caption,
    ratio: { value: ratio(count, total), label: ratioLabel },
  };
}

function kpisFor(role: Role, d: LeadStatsData, s: SalesStats): Kpi[] {
  const newToday = `${d.addedToday} new · 24h`;

  if (role === "client") {
    return [
      totalCard(d, "Delivered leads", d.total > 0 ? newToday : "from the pipeline"),
      countRatioCard("email", "With email", d.withEmail, d.total, "have an email", "ready to contact"),
      ratingCard(d, "business quality"),
    ];
  }

  if (role === "sales") {
    return [
      totalCard(d, "Pipeline leads", "top of funnel"),
      countRatioCard("open", "Open in queue", s.open, s.queueTotal, "of your queue", "awaiting your call"),
      countRatioCard("engaged", "Engaged", s.engaged, s.queueTotal, "of your queue", "clicked the email"),
      {
        id: "won",
        label: "Closed · 30d",
        value: formatKpi(s.wonValue, "usd0"),
        numeric: s.wonValue,
        format: "usd0",
        caption: `${s.won} ${s.won === 1 ? "deal" : "deals"} won`,
        ratio: { value: ratio(s.won, s.queueTotal), label: "close rate" },
      },
    ];
  }

  // admin
  return [
    totalCard(
      d,
      "Total leads",
      `${d.folders} ${d.folders === 1 ? "folder" : "folders"} · ${d.addedToday} new · 24h`,
    ),
    countRatioCard("email", "With email", d.withEmail, d.total, "have an email", "reachable by email"),
    countRatioCard("phone", "With phone", d.withPhone, d.total, "have a phone", "callable directly"),
    ratingCard(d, `across ${d.ratedCount} rated`),
  ];
}

/* ───────────────────────────  page  ─────────────────────────── */

function fmtImport(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export function OverviewPage() {
  const { role } = useRbac();
  const { state, reload } = useLeadStats();
  const { leads } = useSales();

  const salesStats = useMemo<SalesStats>(() => {
    const open = leads.filter((l) => l.status === "new" || l.status === "contacted").length;
    const engaged = leads.filter((l) => l.engaged && l.status !== "closed_lost").length;
    const won = leads.filter((l) => l.status === "closed_won");
    const wonValue = won.reduce((sum, l) => sum + (l.closedValue ?? l.dealValue), 0);
    return { open, engaged, won: won.length, wonValue, queueTotal: leads.length };
  }, [leads]);

  const copy = copyFor(role);
  const data = state.status === "ready" ? state.data : null;
  const kpis = data ? kpisFor(role, data, salesStats) : loadingKpis(role);

  // Week first → it's the default; the panel auto-cycles week → day → month.
  const histogramModes = useMemo<HistogramMode[]>(() => {
    if (!data) return [];
    return [
      { id: "week", label: "Week", data: data.byWeek, unit: "leads" },
      { id: "day", label: "Day", data: data.byDay, unit: "leads" },
      { id: "month", label: "Month", data: data.byMonth, unit: "leads" },
    ];
  }, [data]);

  const kpiCols = kpis.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3";

  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:px-6">
      {/* in-page section header */}
      <Reveal className="mb-5" y={6}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {copy.kicker}
            </div>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {copy.title}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">{copy.lede}</p>
          </div>
          <div className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <div>Last import</div>
            <div className="tnum text-foreground/80">{fmtImport(data?.latestImport ?? null)}</div>
            {data?.mode === "demo" && (
              <div className="mt-1 inline-flex items-center gap-1 rounded border border-border bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                demo mode
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {state.status === "error" ? (
        <Reveal>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="text-base font-semibold text-foreground">Couldn&rsquo;t load lead data</h2>
            <p role="alert" className="max-w-md font-mono text-[11px] leading-relaxed text-muted-foreground">
              {state.error}
            </p>
            <Button variant="outline" size="sm" onClick={reload} data-track="overview_retry" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </Button>
          </div>
        </Reveal>
      ) : (
        <>
          {/* KPIs fused into one instrument panel, hairline-divided via gap-px */}
          <Reveal delay={0.04}>
            <div
              className={cn(
                "grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10",
                kpiCols,
              )}
            >
              {kpis.map((kpi) => (
                <KpiCard key={kpi.id} kpi={kpi} />
              ))}
            </div>
          </Reveal>

          {/* histogram + recent table, side by side on lg (equal height) */}
          <div className="mt-3 grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1.45fr_1fr]">
            <Reveal delay={0.12} className="h-full">
              {data ? (
                <LeadsHistogram
                  modes={histogramModes}
                  title={copy.histogramTitle}
                  emptyHint={copy.histogramEmpty}
                  autoCycle
                />
              ) : (
                <HistogramSkeleton title={copy.histogramTitle} />
              )}
            </Reveal>
            <Reveal delay={0.16} className="h-full">
              {data ? (
                <RecentLeadsTable
                  rows={data.recent}
                  title={copy.recentTitle}
                  emptyHint={copy.recentEmpty}
                />
              ) : (
                <RecentSkeleton title={copy.recentTitle} />
              )}
            </Reveal>
          </div>
        </>
      )}

      <Footer />
    </div>
  );
}

/* ───────────────────────────  loading skeletons (§12.3)  ─────────────────────────── */

function HistogramSkeleton({ title }: { title: string }) {
  const bars = [40, 65, 52, 78, 60, 88, 72, 95, 80, 70, 90, 100];
  return (
    <section
      className="flex h-full min-w-0 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      aria-busy
    >
      <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-6 flex min-h-[180px] flex-1 items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t-sm bg-muted"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Reading pipeline…
      </p>
    </section>
  );
}

function RecentSkeleton({ title }: { title: string }) {
  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10" aria-busy>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          loading
        </span>
      </div>
      <div className="p-3">
        <TableSkeleton />
      </div>
    </section>
  );
}
