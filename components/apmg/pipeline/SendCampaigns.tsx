"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Check,
  Mail,
  PenLine,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Target,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  bestEmail,
  DEFAULT_BODY_HTML,
  DEFAULT_CAMPAIGN,
  DEFAULT_SUBJECT,
  MAX_RECIPIENTS,
  MERGE_TOKENS,
  renderBody,
  renderSubject,
  slugifyCampaign,
  trackedLink,
} from "@/lib/pipeline/campaign";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/Can";
import { Footer } from "../Footer";
import { Reveal } from "../Reveal";
import { SignalLed } from "../SignalLed";
import {
  ErrorInline,
  LeadsTableView,
  TableSkeleton,
  type LeadView,
} from "./LeadsTable";
import { StepRail, type FlowStep, type StepStatus } from "./StepRail";

const EASE = [0.16, 1, 0.3, 1] as const;
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;
// keep in sync with UNGROUPED in lib/pipeline/server.ts
const UNGROUPED = "__ungrouped__";

type SendPhase = "idle" | "sending" | "done" | "error";
type SendMode = "live" | "demo" | "noop";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function folderLabel(batch: string): string {
  return batch === UNGROUPED ? "Ungrouped" : batch;
}

/** Resolve the host the tracked CTA links point at (build-pinned or this origin). */
function trackBase(): string {
  return process.env.NEXT_PUBLIC_TRACK_BASE || (typeof window !== "undefined" ? window.location.origin : "");
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; rows: LeadView[]; mode: string };

/**
 * Send Campaigns (Automation) — the Pipeline sub-tab that turns stored leads
 * into a tracked outreach send. Three n8n-style nodes:
 *   1. Audience      — pick which emailable leads to contact
 *   2. Compose       — subject + HTML body with {{business}}/{{link}} merge tokens
 *   3. Review & send — fire the campaign (n8n webhook, or simulated in demo mode)
 *
 * Each recipient's CTA is rewritten to /t/<leadId>?c=<campaign>, so a click
 * flips the lead's "Engaged" badge and feeds the email-gated Sales queue.
 */
export function SendCampaigns({ onSwitchToLeads }: { onSwitchToLeads?: () => void }) {
  const reduce = !!useReducedMotion();

  // which node is in view (0 audience · 1 compose · 2 send)
  const [selected, setSelected] = useState(0);

  // ── audience ──
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState<string>("all");
  const [q, setQ] = useState("");

  // ── compose ──
  const [campaign, setCampaign] = useState(DEFAULT_CAMPAIGN);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY_HTML);

  // ── send ──
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [sentShown, setSentShown] = useState(0);
  // the denominator the progress bar fills toward. Starts as the optimistic
  // client count, then snaps to the server's actual sent count (which may be
  // lower — it de-dupes by address) so the bar can reach 100%.
  const [sendTotal, setSendTotal] = useState(0);
  const [result, setResult] = useState<{ sent: number; mode: SendMode; campaign: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // unmount / re-run guards (the sub-tab unmounts on switch, like the importer)
  const mountedRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const res = await fetch("/api/pipeline/leads", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; rows?: LeadView[]; mode?: string; error?: string }
        | null;
      if (!mountedRef.current) return;
      if (!res.ok || !data?.ok) {
        setLoad({ status: "error", error: data?.error ?? `Couldn't load leads (${res.status}).` });
        return;
      }
      setLoad({ status: "ready", rows: data.rows ?? [], mode: data.mode ?? "live" });
    } catch {
      if (mountedRef.current) setLoad({ status: "error", error: "Network error loading leads." });
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // leads we can actually email: have a stable id + at least one address
  const emailable = useMemo<LeadView[]>(
    () => (load.status === "ready" ? load.rows.filter((r) => r.id && (r.emails?.length ?? 0) > 0) : []),
    [load],
  );

  // drop picked ids that no longer exist after a refresh
  useEffect(() => {
    setPicked((prev) => {
      const ids = new Set(emailable.map((r) => r.id!).filter(Boolean));
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [emailable]);

  // folder options (newest folders first; Ungrouped sinks to the bottom)
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const r of emailable) set.add(r.batch ?? UNGROUPED);
    return [...set].sort((a, b) => {
      if (a === UNGROUPED) return 1;
      if (b === UNGROUPED) return -1;
      return b.localeCompare(a);
    });
  }, [emailable]);

  const term = q.trim().toLowerCase();
  const visible = useMemo(() => {
    return emailable
      .filter((r) => (folder === "all" ? true : (r.batch ?? UNGROUPED) === folder))
      .filter((r) =>
        term
          ? r.name.toLowerCase().includes(term) ||
            (r.website ?? "").toLowerCase().includes(term) ||
            (r.emails ?? []).some((e) => e.toLowerCase().includes(term))
          : true,
      );
  }, [emailable, folder, term]);

  // the actual send list — selected, emailable leads with a resolved best address
  const recipients = useMemo(
    () =>
      emailable
        .filter((r) => r.id && picked.has(r.id))
        .map((r) => ({ id: r.id!, email: bestEmail(r.emails)!, business: r.name }))
        .filter((r) => !!r.email),
    [emailable, picked],
  );
  const recipientCount = recipients.length;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setPicked((prev) => {
      const ids = visible.map((r) => r.id!).filter(Boolean);
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  const send = useCallback(async () => {
    if (recipients.length === 0 || recipients.length > MAX_RECIPIENTS) return;
    const tag = slugifyCampaign(campaign) || DEFAULT_CAMPAIGN;

    const runId = ++runIdRef.current;
    const live = () => mountedRef.current && runId === runIdRef.current;

    setError(null);
    setResult(null);
    setSentShown(0);
    setSendTotal(recipients.length); // optimistic; corrected from the response below
    setSendPhase("sending");
    setSelected(2);

    let res: Response;
    try {
      res = await fetch("/api/pipeline/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign: tag, subject, bodyHtml: body, recipients }),
      });
    } catch {
      if (live()) {
        setError("Network error reaching the campaign sender.");
        setSendPhase("error");
      }
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; sent?: number; mode?: SendMode; campaign?: string; error?: string }
      | null;
    if (!live()) return;
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? `The sender responded ${res.status}.`);
      setSendPhase("error");
      return;
    }

    const sent = data.sent ?? recipients.length;
    setSendTotal(sent); // the bar now fills toward what was actually sent → reaches 100%
    // eased count-up over a comfortable minimum so the send "registers"
    await tweenTo(rafRef, reduce, setSentShown, 0, sent, Math.max(750, Math.min(1800, sent * 9 + 400)), live);
    if (!live()) return;
    if (!reduce) await sleep(450);
    if (!live()) return;
    setResult({ sent, mode: data.mode ?? "demo", campaign: data.campaign ?? tag });
    setSendPhase("done");
  }, [recipients, campaign, subject, body, reduce]);

  function resetSend() {
    runIdRef.current++; // abort any in-flight tween/await
    setSendPhase("idle");
    setSentShown(0);
    setSendTotal(0);
    setResult(null);
    setError(null);
    setSelected(2);
  }

  const sending = sendPhase === "sending";
  const steps = useMemo<FlowStep[]>(
    () => buildSteps(recipientCount, sendPhase),
    [recipientCount, sendPhase],
  );

  const liveMessage =
    sendPhase === "sending"
      ? `Sending the campaign to ${recipientCount} recipients`
      : sendPhase === "done" && result
        ? `Done. Sent ${result.sent} email${result.sent === 1 ? "" : "s"}${result.mode === "demo" ? " (demo mode)" : ""}.`
        : "";

  const panelKey =
    selected === 0
      ? "audience"
      : selected === 1
        ? "compose"
        : sendPhase === "sending"
          ? "sending"
          : sendPhase === "error"
            ? "send-error"
            : sendPhase === "done"
              ? "sent"
              : "review";

  function renderPanel() {
    if (selected === 0) {
      return (
        <AudiencePanel
          load={load}
          emailableCount={emailable.length}
          visible={visible}
          picked={picked}
          recipientCount={recipientCount}
          folder={folder}
          folders={folders}
          q={q}
          onFolder={setFolder}
          onSearch={setQ}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onRefresh={fetchLeads}
          onContinue={() => setSelected(1)}
          onSwitchToLeads={onSwitchToLeads}
        />
      );
    }
    if (selected === 1) {
      return (
        <ComposePanel
          campaign={campaign}
          subject={subject}
          body={body}
          recipients={recipients}
          onCampaign={setCampaign}
          onSubject={setSubject}
          onBody={setBody}
          onBack={() => setSelected(0)}
          onContinue={() => setSelected(2)}
        />
      );
    }
    // selected === 2 — review & send
    if (sendPhase === "sending") {
      return <SendingPanel sent={sentShown} total={sendTotal || recipientCount} reduce={reduce} />;
    }
    if (sendPhase === "error") {
      return (
        <ErrorPanel
          message={error ?? "The campaign failed to send."}
          onRetry={send}
          onReset={resetSend}
        />
      );
    }
    if (sendPhase === "done" && result) {
      return <SuccessBanner result={result} onReset={resetSend} />;
    }
    return (
      <ReviewPanel
        recipientCount={recipientCount}
        campaign={slugifyCampaign(campaign) || DEFAULT_CAMPAIGN}
        subject={subject}
        onBack={() => setSelected(1)}
        onSend={send}
        sending={sending}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:px-6">
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      {/* header */}
      <Reveal className="mb-4" y={6}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Data pipeline
            </div>
            <h1 className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-xl">
              Send campaigns
            </h1>
          </div>
          <div className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <div>Attribution</div>
            <div className="tnum text-foreground/80">/t/&lt;lead&gt;?c=…</div>
          </div>
        </div>
      </Reveal>

      {/* the n8n-style step rail — nodes are clickable to switch the view */}
      <Reveal delay={0.04} className="mb-3">
        <StepRail
          steps={steps}
          selected={selected}
          onSelect={(i) => {
            // lock navigation onto the send node while a send is in flight so the
            // user can't edit the selection (and the live counts) mid-send
            if (sending && i !== 2) return;
            setSelected(i);
          }}
        />
      </Reveal>

      {/* selected node panel */}
      <Reveal delay={0.08}>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={panelKey}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduce ? 0 : 0.26, ease: PANEL_EASE }}
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </div>
      </Reveal>

      <Footer />
    </div>
  );
}

/* ─────────────────────────────  step status  ───────────────────────────── */

function buildSteps(recipientCount: number, sendPhase: SendPhase): FlowStep[] {
  const sent = sendPhase === "done";
  const s0: StepStatus = recipientCount > 0 ? "done" : "active";
  const s1: StepStatus = sent || sendPhase === "error" ? "done" : recipientCount > 0 ? "active" : "idle";
  const s2: StepStatus =
    sent ? "done" : sendPhase === "sending" ? "active" : sendPhase === "error" ? "error" : "idle";

  return [
    {
      id: "audience",
      label: "Audience",
      icon: Target,
      status: s0,
      detail: recipientCount > 0 ? `${recipientCount.toLocaleString("en-US")} selected` : "Pick recipients",
    },
    {
      id: "compose",
      label: "Compose",
      icon: PenLine,
      status: s1,
      detail: "Subject + tracked link",
    },
    {
      id: "send",
      label: "Review & send",
      icon: Send,
      status: s2,
      detail:
        sendPhase === "sending"
          ? "Sending…"
          : sendPhase === "done"
            ? "Sent"
            : sendPhase === "error"
              ? "Failed"
              : "Confirm send",
    },
  ];
}

/* ─────────────────────────────  audience  ───────────────────────────── */

function AudiencePanel({
  load,
  emailableCount,
  visible,
  picked,
  recipientCount,
  folder,
  folders,
  q,
  onFolder,
  onSearch,
  onToggle,
  onToggleAll,
  onRefresh,
  onContinue,
  onSwitchToLeads,
}: {
  load: LoadState;
  emailableCount: number;
  visible: LeadView[];
  picked: Set<string>;
  recipientCount: number;
  folder: string;
  folders: string[];
  q: string;
  onFolder: (v: string) => void;
  onSearch: (v: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onRefresh: () => void;
  onContinue: () => void;
  onSwitchToLeads?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PhaseHeader
          icon={Target}
          title="Choose your audience"
          meta={
            load.status === "ready"
              ? `${emailableCount.toLocaleString("en-US")} lead${emailableCount === 1 ? "" : "s"} with an email`
              : "stored leads with an email"
          }
        />
        <button
          type="button"
          onClick={onRefresh}
          data-track="campaign_refresh_leads"
          aria-label="Refresh leads"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", load.status === "loading" && "animate-spin")} aria-hidden />
          Refresh
        </button>
      </div>

      {load.status === "loading" && <TableSkeleton />}
      {load.status === "error" && <ErrorInline message={load.error} onRetry={onRefresh} />}

      {load.status === "ready" && emailableCount === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
            <Upload className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-[13px] font-medium text-foreground">No emailable leads yet</p>
          <p className="max-w-xs font-mono text-[10.5px] leading-relaxed text-muted-foreground">
            {load.mode === "demo"
              ? "Connect Supabase, then import a CSV from the Leads tab — leads with an email show up here."
              : "Import a CSV from the Leads tab. Leads that carry an email address become campaign recipients."}
          </p>
          {onSwitchToLeads && (
            <Button variant="outline" size="sm" onClick={onSwitchToLeads} data-track="campaign_goto_leads" className="mt-1 gap-1.5">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Go to Leads
            </Button>
          )}
        </div>
      )}

      {load.status === "ready" && emailableCount > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* folder filter */}
            {folders.length > 1 && (
              <select
                value={folder}
                onChange={(e) => onFolder(e.target.value)}
                data-track="campaign_select_folder"
                aria-label="Filter by folder"
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {folderLabel(f)}
                  </option>
                ))}
              </select>
            )}

            {/* search */}
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="text"
                value={q}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search leads…"
                aria-label="Search leads"
                data-track="campaign_search"
                className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => onSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>

            <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
              <span className="tnum text-foreground">{recipientCount.toLocaleString("en-US")}</span> selected
            </span>
          </div>

          <LeadsTableView
            rows={visible}
            selection={{ selected: picked, onToggle, onToggleAll }}
            emptyHint={q ? `No leads match “${q.trim()}”.` : "No leads in this folder."}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className={cn(
                "font-mono text-[10.5px] leading-relaxed",
                recipientCount > MAX_RECIPIENTS ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {recipientCount > MAX_RECIPIENTS
                ? `Max ${MAX_RECIPIENTS.toLocaleString("en-US")} recipients per send — deselect ${(recipientCount - MAX_RECIPIENTS).toLocaleString("en-US")}.`
                : "Each lead is mailed at its best contact address (prefers info@ / contact@ / sales@)."}
            </p>
            <Button
              data-track="campaign_next_compose"
              disabled={recipientCount === 0 || recipientCount > MAX_RECIPIENTS}
              onClick={onContinue}
              className="gap-1.5"
            >
              Compose email
              <PenLine className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────  compose  ───────────────────────────── */

function ComposePanel({
  campaign,
  subject,
  body,
  recipients,
  onCampaign,
  onSubject,
  onBody,
  onBack,
  onContinue,
}: {
  campaign: string;
  subject: string;
  body: string;
  recipients: Array<{ id: string; email: string; business: string }>;
  onCampaign: (v: string) => void;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const tag = slugifyCampaign(campaign) || DEFAULT_CAMPAIGN;
  const sample = recipients[0] ?? { id: "preview-lead", email: "info@acme-hvac.com", business: "Acme HVAC & Plumbing" };
  const link = trackedLink(trackBase(), sample.id, tag);

  const previewDoc = useMemo(() => {
    const inner = renderBody(body, { business: sample.business, link });
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{margin:0;padding:18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;background:#fff}p{margin:0 0 14px}a{color:#c8102e;font-weight:600;text-decoration:underline}</style></head><body>${inner}</body></html>`;
  }, [body, sample.business, link]);

  const canContinue = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader icon={PenLine} title="Compose the email" meta={`Campaign · ${tag}`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* editor */}
        <div className="flex flex-col gap-3">
          <Field label="Campaign tag" hint="Used as the ?c= tracking value">
            <input
              type="text"
              value={campaign}
              onChange={(e) => onCampaign(e.target.value)}
              data-track="campaign_tag"
              placeholder={DEFAULT_CAMPAIGN}
              className="h-8 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field label="Subject">
            <input
              type="text"
              value={subject}
              onChange={(e) => onSubject(e.target.value)}
              data-track="campaign_subject"
              maxLength={300}
              className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field label="Body (HTML)" hint={`Merge tokens: ${MERGE_TOKENS.join(" · ")}`}>
            <textarea
              value={body}
              onChange={(e) => onBody(e.target.value)}
              data-track="campaign_body"
              rows={9}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
        </div>

        {/* preview */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Live preview
            </span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              to {sample.email}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-background/40">
            <div className="border-b border-border bg-card px-3 py-2">
              <div className="truncate text-[12.5px] font-semibold text-foreground">
                {renderSubject(subject, { business: sample.business }) || "(no subject)"}
              </div>
              <div className="mt-px truncate font-mono text-[10px] text-muted-foreground">
                APMG Services · preview for {sample.business}
              </div>
            </div>
            <iframe
              title="Email preview"
              srcDoc={previewDoc}
              sandbox=""
              className="h-[300px] w-full bg-white"
            />
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            The CTA link is rewritten per lead to <span className="text-foreground/80">/t/&lt;lead&gt;?c={tag}</span> — a click marks the lead engaged and surfaces it in Sales.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} data-track="campaign_back_audience" className="gap-1.5">
          Back
        </Button>
        <Button onClick={onContinue} disabled={!canContinue} data-track="campaign_next_send" className="gap-1.5">
          Review &amp; send
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        {hint && <span className="font-mono text-[9.5px] text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ─────────────────────────────  review & send  ───────────────────────────── */

function ReviewPanel({
  recipientCount,
  campaign,
  subject,
  onBack,
  onSend,
  sending,
}: {
  recipientCount: number;
  campaign: string;
  subject: string;
  onBack: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const none = recipientCount === 0;
  const overCap = recipientCount > MAX_RECIPIENTS;
  const blocked = none || overCap;
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader icon={Send} title="Review & send" meta="nothing is sent until you confirm" />

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Stat label="Recipients" value={recipientCount.toLocaleString("en-US")} />
        <Stat label="Campaign tag" value={campaign} mono />
        <Stat label="Delivery" value="n8n · tracked" />
      </dl>

      <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Subject</div>
        <div className="mt-0.5 truncate text-[13px] text-foreground">{subject || "(no subject)"}</div>
      </div>

      {blocked ? (
        <p role="alert" className="font-mono text-[11px] text-destructive">
          {none
            ? "No recipients selected — go back to Audience and pick at least one lead."
            : `Too many recipients (${recipientCount.toLocaleString("en-US")}) — max ${MAX_RECIPIENTS.toLocaleString("en-US")} per send. Go back and deselect some.`}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-solid text-primary-foreground">
            <Send className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-foreground">
              Send to {recipientCount.toLocaleString("en-US")} lead{recipientCount === 1 ? "" : "s"}?
            </div>
            <div className="truncate font-mono text-[10.5px] text-muted-foreground">
              Triggers the outreach automation · each email carries a tracked link
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} data-track="campaign_back_compose" className="gap-1.5">
          Back
        </Button>
        <Can
          perm="campaigns.send"
          fallback={
            <span className="font-mono text-[10.5px] text-muted-foreground">
              Your role can&apos;t send campaigns.
            </span>
          }
        >
          <Button
            onClick={onSend}
            disabled={blocked || sending}
            data-track="campaign_send_confirm"
            className="gap-1.5 bg-primary-solid text-primary-foreground hover:bg-primary-solid/90"
          >
            <Send className="h-4 w-4" aria-hidden />
            Send campaign
          </Button>
        </Can>
      </div>
    </div>
  );
}

function SendingPanel({ sent, total, reduce }: { sent: number; total: number; reduce: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader icon={Send} title="Sending campaign" meta="outreach automation" />

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="tnum font-mono text-[34px] font-semibold leading-none text-foreground sm:text-[40px]">
            {sent.toLocaleString("en-US")}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            of {total.toLocaleString("en-US")} emails queued
          </div>
        </div>
        <SignalLed className="mb-2 h-2.5 w-2.5" />
      </div>

      <Bar value={total ? sent / total : 0} reduce={reduce} label="Send progress" />

      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
        <Mail className="h-3.5 w-3.5 text-primary" aria-hidden />
        <span className="truncate">POST · campaign automation</span>
        <span className="tnum ml-auto text-foreground/70">{total ? Math.round((sent / total) * 100) : 0}%</span>
      </div>
    </div>
  );
}

function SuccessBanner({
  result,
  onReset,
}: {
  result: { sent: number; mode: SendMode; campaign: string };
  onReset: () => void;
}) {
  const demo = result.mode === "demo";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-solid text-primary-foreground">
          <Check className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground">
            Sent {result.sent.toLocaleString("en-US")} email{result.sent === 1 ? "" : "s"}
          </div>
          <div className="truncate font-mono text-[10.5px] text-muted-foreground">
            {demo
              ? "Demo mode — not actually delivered (set N8N_CAMPAIGN_WEBHOOK_URL to go live)"
              : `Campaign ${result.campaign} · handed to the automation`}
          </div>
        </div>
        <Button variant="outline" size="sm" data-track="campaign_send_another" onClick={onReset} className="ml-auto gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          New send
        </Button>
      </div>
      <p className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        Leads that click the tracked link are marked engaged and flow into the Sales queue, which only shows
        leads that have been emailed.
      </p>
    </div>
  );
}

function ErrorPanel({
  message,
  onRetry,
  onReset,
}: {
  message: string;
  onRetry: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="text-base font-semibold text-foreground">Send failed</h2>
      <p role="alert" className="max-w-md font-mono text-[11px] leading-relaxed text-muted-foreground">
        {message}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Button data-track="campaign_retry" onClick={onRetry} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
        <Button variant="outline" data-track="campaign_send_startover" onClick={onReset}>
          Back to review
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────  bits  ───────────────────────────── */

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate text-[15px] font-semibold text-foreground", mono && "font-mono text-[13px]")}>
        {value}
      </div>
    </div>
  );
}

function PhaseHeader({ icon: Icon, title, meta }: { icon: typeof Send; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        <div className="truncate font-mono text-[10.5px] text-muted-foreground">{meta}</div>
      </div>
    </div>
  );
}

function Bar({ value, reduce, label }: { value: number; reduce: boolean; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: reduce ? 0 : 0.25, ease: EASE }}
      />
    </div>
  );
}

/** Eased count-up shared by the send progress fill. Snaps under reduced motion;
 *  `live` lets a stale run bail, and the rAF id is tracked for cancel-on-unmount. */
function tweenTo(
  rafRef: MutableRefObject<number | null>,
  reduce: boolean,
  apply: (n: number) => void,
  from: number,
  to: number,
  dur: number,
  live: () => boolean,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (reduce || dur <= 0 || to === from) {
      apply(to);
      resolve();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      if (!live()) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      apply(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        apply(to);
        resolve();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  });
}
