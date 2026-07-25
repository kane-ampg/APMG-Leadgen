"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SALES_LEADS, type SalesLead, type SalesStatus } from "@/lib/data/sales";
import type { SalesQueueResponse, SalesQueueRow } from "@/lib/sales/queue";

export interface CloseDealInput {
  note: string;
  value: number;
}

/** Funnel tallies shared by the Sales tab and the Overview KPI cards. */
export interface SalesStats {
  open: number;
  engaged: number;
  won: number;
  wonValue: number;
  queueTotal: number;
}

interface SalesContextValue {
  /** the CURRENT PAGE of the queue, status overrides applied */
  leads: SalesLead[];
  /** closed-won deals, most recently closed first */
  closedDeals: SalesLead[];
  stats: SalesStats;
  /** unique emailed leads across all pages */
  total: number;
  /** 1-based current page */
  page: number;
  pageCount: number;
  pageSize: number;
  loading: boolean;
  mode: "live" | "demo";
  error: string | null;
  /** portal_events doesn't exist yet — run supabase/portal-telemetry.sql */
  needsMigration: boolean;
  setPage: (page: number) => void;
  reload: () => void;
  markContacted: (id: string) => void;
  markLost: (id: string) => void;
  closeDeal: (id: string, input: CloseDealInput) => void;
  /** retract the last status change on a lead — undoes mark-contacted, a close,
   *  or a lost mark, stepping back one mark at a time */
  revertStatus: (id: string) => void;
}

const SalesContext = createContext<SalesContextValue | null>(null);

/** Leads per queue page — pairs with the card grid (1/2/3 columns). */
const PAGE_SIZE = 12;

function shortDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Jul 15, 09:12" from an ISO stamp; undefined when absent/garbled. */
function fmtStamp(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day}, ${time}`;
}

/** Map one /api/sales/queue row into the card shape. Everything the scraper
 *  didn't capture (score, AI brief, deal estimate) stays undefined and the
 *  card simply omits it. */
function toSalesLead(r: SalesQueueRow): SalesLead {
  const sentAt = fmtStamp(r.lastSentAt) ?? "recently";
  return {
    id: r.id,
    business: r.business,
    category: r.category ?? "Uncategorised",
    location: r.location ?? undefined,
    website: r.website ?? undefined,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    rating: r.rating ?? undefined,
    emailSent: true,
    emailSentAt: sentAt,
    emailsSent: r.emailsSent,
    engaged: r.engaged,
    engagedAt: fmtStamp(r.engagedAt),
    status: "new",
    receivedAt: sentAt,
  };
}

/**
 * Sales state shared by the Sales queue, Closed-deals tab, Overview KPIs and
 * the sidebar badge. The queue itself is REAL data: every lead the admin has
 * emailed (the portal_events email_sent ledger), fetched one server-paginated
 * page at a time from /api/sales/queue. Demo mode (no Supabase configured)
 * falls back to the preset so the tab stays exercisable.
 *
 * Status changes (contacted / lost / closed) are kept in-memory per lead id —
 * they survive paging back and forth, but not a reload; persisting them is a
 * separate migration. Every mark is retractable: the status it replaced is
 * pushed onto a per-lead stack, so revertStatus steps back one mark at a time.
 * Closing a deal snapshots the full lead into closedDeals so the Closed tab
 * keeps it even after the queue pages away (a retraction removes it again).
 */
export function SalesProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<SalesLead[]>([]);
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [page, setPageState] = useState(1);
  const [total, setTotal] = useState(0);
  const [engagedTotal, setEngagedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Partial<SalesLead>>>({});
  // per-lead stack of the statuses each mark replaced — powers revertStatus
  const [statusHistory, setStatusHistory] = useState<Record<string, SalesStatus[]>>({});
  const [closedDeals, setClosedDeals] = useState<SalesLead[]>([]);
  // increment to refetch the current page; also guards stale responses
  const [reloadTick, setReloadTick] = useState(0);
  const requestSeq = useRef(0);
  const demoSeeded = useRef(false);

  useEffect(() => {
    const seq = ++requestSeq.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      let data: SalesQueueResponse;
      try {
        const res = await fetch(`/api/sales/queue?page=${page}&pageSize=${PAGE_SIZE}`, {
          cache: "no-store",
        });
        data = (await res.json()) as SalesQueueResponse;
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || "Couldn't load the sales queue.");
        }
      } catch (e) {
        if (cancelled || seq !== requestSeq.current) return;
        setError(e instanceof Error ? e.message : "Couldn't load the sales queue.");
        setLoading(false);
        return;
      }
      if (cancelled || seq !== requestSeq.current) return;

      if (data.mode === "demo") {
        // No database configured — preset queue, one page.
        setMode("demo");
        setRows(SALES_LEADS);
        setTotal(SALES_LEADS.length);
        setEngagedTotal(SALES_LEADS.filter((l) => l.engaged).length);
        setNeedsMigration(false);
        if (!demoSeeded.current) {
          demoSeeded.current = true;
          setClosedDeals(SALES_LEADS.filter((l) => l.status === "closed_won"));
        }
      } else {
        setMode("live");
        setRows(data.rows.map(toSalesLead));
        setTotal(data.total);
        setEngagedTotal(data.engagedTotal);
        setNeedsMigration(!!data.needsMigration);
        // queue shrank under us (deletes) — snap back to the last real page
        const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (page > pageCount) setPageState(pageCount);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [page, reloadTick]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setPage = useCallback(
    (p: number) => setPageState(Math.min(Math.max(1, p), Math.max(1, Math.ceil(total / PAGE_SIZE)))),
    [total],
  );

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const leads = useMemo(
    () => rows.map((l) => (overrides[l.id] ? { ...l, ...overrides[l.id] } : l)),
    [rows, overrides],
  );

  /** what a lead is showing right now: its override, else the server/preset row */
  const statusOf = useCallback(
    (id: string): SalesStatus =>
      overrides[id]?.status ?? rows.find((l) => l.id === id)?.status ?? "new",
    [overrides, rows],
  );

  /** remember the status a mark replaced, so revertStatus can put it back */
  const pushStatus = useCallback((id: string, from: SalesStatus) => {
    setStatusHistory((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), from] }));
  }, []);

  const markContacted = useCallback(
    (id: string) => {
      pushStatus(id, statusOf(id));
      setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], status: "contacted" } }));
    },
    [pushStatus, statusOf],
  );

  const markLost = useCallback(
    (id: string) => {
      pushStatus(id, statusOf(id));
      setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], status: "closed_lost" } }));
    },
    [pushStatus, statusOf],
  );

  const closeDeal = useCallback(
    (id: string, input: CloseDealInput) => {
      const patch: Partial<SalesLead> = {
        status: "closed_won",
        closedNote: input.note.trim(),
        closedValue: input.value,
        closedAt: shortDate(),
      };
      pushStatus(id, statusOf(id));
      setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
      // snapshot for the Closed-deals tab so it survives paging away
      const lead = rows.find((l) => l.id === id);
      if (lead) {
        setClosedDeals((prev) => [{ ...lead, ...patch }, ...prev.filter((l) => l.id !== id)]);
      }
    },
    [rows, pushStatus, statusOf],
  );

  const revertStatus = useCallback(
    (id: string) => {
      const stack = statusHistory[id] ?? [];
      // nothing recorded (e.g. a preset that arrived already closed) → back to new
      const back: SalesStatus = stack.length ? stack[stack.length - 1] : "new";
      setStatusHistory((prev) => {
        const rest = (prev[id] ?? []).slice(0, -1);
        const next = { ...prev };
        if (rest.length) next[id] = rest;
        else delete next[id];
        return next;
      });
      setOverrides((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: back,
          // reopening a deal drops the close snapshot with it
          closedNote: undefined,
          closedValue: undefined,
          closedAt: undefined,
        },
      }));
      // no longer won — pull it back out of the Closed-deals tab
      setClosedDeals((prev) => prev.filter((l) => l.id !== id));
    },
    [statusHistory],
  );

  const stats = useMemo<SalesStats>(() => {
    if (mode === "demo") {
      const open = leads.filter((l) => l.status === "new" || l.status === "contacted").length;
      const engaged = leads.filter((l) => l.engaged && l.status !== "closed_lost").length;
      const wonValue = closedDeals.reduce((sum, l) => sum + (l.closedValue ?? l.dealValue ?? 0), 0);
      return { open, engaged, won: closedDeals.length, wonValue, queueTotal: total };
    }
    // live: totals come from the server; won/lost are session-local overlays
    const lost = Object.values(overrides).filter((o) => o.status === "closed_lost").length;
    const wonValue = closedDeals.reduce((sum, l) => sum + (l.closedValue ?? l.dealValue ?? 0), 0);
    return {
      open: Math.max(0, total - closedDeals.length - lost),
      engaged: engagedTotal,
      won: closedDeals.length,
      wonValue,
      queueTotal: total,
    };
  }, [mode, leads, overrides, closedDeals, total, engagedTotal]);

  const value = useMemo<SalesContextValue>(
    () => ({
      leads,
      closedDeals,
      stats,
      total,
      page,
      pageCount,
      pageSize: PAGE_SIZE,
      loading,
      mode,
      error,
      needsMigration,
      setPage,
      reload,
      markContacted,
      markLost,
      closeDeal,
      revertStatus,
    }),
    [
      leads,
      closedDeals,
      stats,
      total,
      page,
      pageCount,
      loading,
      mode,
      error,
      needsMigration,
      setPage,
      reload,
      markContacted,
      markLost,
      closeDeal,
      revertStatus,
    ],
  );

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}

export function useSales(): SalesContextValue {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error("useSales must be used within <SalesProvider>");
  return ctx;
}
