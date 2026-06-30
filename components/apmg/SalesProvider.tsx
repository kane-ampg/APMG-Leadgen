"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SALES_LEADS, type SalesLead } from "@/lib/data/sales";

export interface CloseDealInput {
  note: string;
  value: number;
}

interface SalesContextValue {
  leads: SalesLead[];
  /** closed-won deals, most recently closed first */
  closedDeals: SalesLead[];
  markContacted: (id: string) => void;
  markLost: (id: string) => void;
  closeDeal: (id: string, input: CloseDealInput) => void;
}

const SalesContext = createContext<SalesContextValue | null>(null);

function shortDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Shared sales state so the Sales queue and the Closed-deals tab read and
 * mutate the same leads. Closing a deal stamps the rep's note, the closed
 * value, and the close date — that note is what surfaces on the Closed tab.
 */
export function SalesProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<SalesLead[]>(SALES_LEADS);

  const markContacted = useCallback((id: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: "contacted" } : l)));
  }, []);

  const markLost = useCallback((id: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: "closed_lost" } : l)));
  }, []);

  const closeDeal = useCallback((id: string, input: CloseDealInput) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              status: "closed_won",
              closedNote: input.note.trim(),
              closedValue: input.value,
              closedAt: shortDate(),
            }
          : l,
      ),
    );
  }, []);

  const closedDeals = useMemo(
    () => leads.filter((l) => l.status === "closed_won"),
    [leads],
  );

  const value = useMemo<SalesContextValue>(
    () => ({ leads, closedDeals, markContacted, markLost, closeDeal }),
    [leads, closedDeals, markContacted, markLost, closeDeal],
  );

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}

export function useSales(): SalesContextValue {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error("useSales must be used within <SalesProvider>");
  return ctx;
}
