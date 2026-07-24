// Shared contract for GET /api/sales/queue — the paginated Sales-queue read.
// Client-safe (types only): imported by the route (server) and SalesProvider
// (client), so the two can never drift apart.

/** One emailed lead in the Sales queue, newest send first. Contact fields are
 *  null when the scraped lead simply doesn't have them. */
export interface SalesQueueRow {
  id: string;
  business: string;
  category: string | null;
  /** the lead's scraped address, shown as the card's location line */
  location: string | null;
  /** hostname/path only — the UI prepends https:// */
  website: string | null;
  phone: string | null;
  /** best contact address (same picker the campaign send uses) */
  email: string | null;
  rating: number | null;
  /** lead clicked the tracked /t/<id> link (attribution confirmed) */
  engaged: boolean;
  engagedAt: string | null;
  /** most recent email_sent ledger row for this lead, ISO */
  lastSentAt: string;
  /** total outreach emails sent to this lead (ledger tally) */
  emailsSent: number;
  /** campaign tag of the most recent send */
  campaign: string | null;
}

export interface SalesQueueResponse {
  ok: boolean;
  mode: "live" | "demo";
  rows: SalesQueueRow[];
  /** unique emailed leads across ALL pages */
  total: number;
  /** how many of those have clicked the tracked link */
  engagedTotal: number;
  /** 1-based page this response covers */
  page: number;
  pageSize: number;
  /** portal_events doesn't exist yet — run supabase/portal-telemetry.sql */
  needsMigration?: boolean;
  error?: string;
}
