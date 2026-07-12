"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CircleCheck, Loader2, Send, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { track } from "@/lib/telemetry";

const EASE = [0.22, 1, 0.36, 1] as const;
/** The message must say *something* before the send button enables — a bare
 *  email address gives the team nothing to quote against. */
const MIN_MESSAGE = 10;
/** Matches the server-side check in /api/portal/inquiries — validate the same
 *  way on both sides so a value that passes here never 400s there. Rejects
 *  `?&=#` (never valid in real addresses) so a crafted "email" can't smuggle
 *  mailto query params into anyone's mail compose. */
const EMAIL_RE = /^[^\s@?&=#]+@[^\s@?&=#]+\.[^\s@?&=#]+$/;
/** Fallback inbox when the API is unreachable — an enquiry must never be lost
 *  just because our storage had a bad moment. */
const CONTACT_EMAIL = "kane@apmgservices.com.au";

/** Shape shared with ServicesPortal's SERVICES entries and its `general`
 *  pseudo-service (hero / closing CTAs) — structurally identical on purpose. */
export interface InquiryService {
  slug: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
}

type Status = "idle" | "sending" | "sent" | "error";

/** Shape of GET /api/portal/legal — the current published policy the customer
 *  agrees to. `placeholder` is true until lawyer-reviewed wording is set. */
interface LegalInfo {
  version: string;
  termsHtml: string;
  privacyHtml: string;
  placeholder: boolean;
}

/**
 * Customer-facing enquiry modal for the services portal. Mirrors the
 * CloseDealModal grammar exactly (AnimatePresence, z-[80]/[81] backdrop +
 * dialog, focus trap with restore, Escape closes, header icon + title + X,
 * footer Buttons) so both surfaces feel like the same product.
 *
 * The lead-safety contract: a network or server failure NEVER discards what
 * the visitor typed — the form stays populated, an inline error explains what
 * happened, and a prefilled mailto: link offers a second path to the team.
 * Demo mode (no Supabase configured) still resolves to the thank-you state so
 * the portal never looks broken to a customer.
 *
 * Telemetry: the successful submit is tracked manually (`portal_inquiry_submit`)
 * because only the API response tells us it landed; the Cancel button is
 * declaratively tracked via data-track like every other element.
 */
export function ServiceInquiryModal({
  service,
  onClose,
  standalone = false,
}: {
  service: InquiryService | null;
  onClose: () => void;
  /** True on the public /portal host. Gates the customer-facing consent
   *  requirement + the `consent_accept` funnel event (the internal "Our
   *  Services" demo tab must not require consent nor pollute the funnel). */
  standalone?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  /** Success-panel Done button — focused when the form unmounts on send. */
  const doneRef = useRef<HTMLButtonElement>(null);
  /** Inline error region — focused when a failed send disables the submit. */
  const errorRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  /** Honeypot — see the hidden field below. Humans never touch it. */
  const [website, setWebsite] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  /** Consent gate (customer host only): the enquirer must actively tick this
   *  before we collect their details. Unticked by default (active consent, per
   *  OAIC guidance) and re-armed per enquiry. */
  const [consentChecked, setConsentChecked] = useState(false);
  /** Current published legal docs, fetched on open so we show the exact text +
   *  version the customer agrees to and pin that version onto the submission. */
  const [legal, setLegal] = useState<LegalInfo | null>(null);
  /** Which doc is expanded inline (T&C / Privacy), or null. */
  const [openDoc, setOpenDoc] = useState<"terms" | "privacy" | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  /** Mirror of `status` readable inside the open-effect without adding it to
   *  the deps (which would re-run the reset mid-flow). */
  const statusRef = useRef<Status>("idle");
  function setStatusBoth(next: Status) {
    statusRef.current = next;
    setStatus(next);
  }

  useFocusTrap(!!service, ref);

  useEffect(() => {
    if (!service) return;
    // Only wipe the form after a *successful* send — if the visitor closed on
    // an error (or just changed their mind mid-typing) their words are still
    // here when they reopen. Losing a typed-out enquiry loses the lead.
    if (statusRef.current === "sent") {
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
    }
    setStatusBoth("idle");
    setWebsite("");
    setEmailTouched(false);
    // Re-arm consent per enquiry — an earlier acceptance must never silently
    // carry over to a new submission (or a new terms version).
    setConsentChecked(false);
    setOpenDoc(null);
    // focus the first field after the trap's initial focus + paint
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [service]);

  // Fetch the current published legal docs when the modal opens (customer host
  // only — the internal demo tab neither gates nor records consent). We pin the
  // returned `version` onto the submission; the server re-validates it against
  // the live version, so a stale fetch can't smuggle bad consent through.
  useEffect(() => {
    if (!service || !standalone) return;
    let cancelled = false;
    fetch("/api/portal/legal", { headers: { "Content-Type": "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: (LegalInfo & { ok?: boolean }) | null) => {
        if (cancelled || !j || j.ok === false) return;
        setLegal({
          version: String(j.version ?? ""),
          termsHtml: String(j.termsHtml ?? ""),
          privacyHtml: String(j.privacyHtml ?? ""),
          placeholder: Boolean(j.placeholder),
        });
      })
      .catch(() => {
        /* leave legal null → the consent block shows a soft "unavailable" note
           and the submit stays gated (fail-closed) on the customer host */
      });
    return () => {
      cancelled = true;
    };
  }, [service, standalone]);

  useEffect(() => {
    if (!service) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [service, onClose]);

  // Keep keyboard focus inside the dialog across the submit transitions: when
  // the send lands the whole form (including the focused, now-disabled submit
  // button) unmounts for the success panel, and on failure the focused button
  // is disabled — either way the browser drops focus to <body>, where the
  // container-scoped focus trap can't recover it and the next Tab would land
  // on obscured page content behind the modal. Refocus explicitly.
  useEffect(() => {
    if (status === "sent") {
      requestAnimationFrame(() => doneRef.current?.focus());
    } else if (status === "error") {
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }, [status]);

  const emailValid = EMAIL_RE.test(email.trim());
  const showEmailError = emailTouched && email.trim() !== "" && !emailValid;
  const messageLength = message.trim().length;
  /** Started typing but under the minimum — surface WHY Send is disabled
   *  instead of leaving a silently-dead button on a conversion-critical form. */
  const showMessageHint = messageLength > 0 && messageLength < MIN_MESSAGE;
  /** On the customer host consent is mandatory: a real (non-placeholder) policy
   *  must be loaded AND the box ticked. On the internal demo tab it's not
   *  required. If the policy fetch failed or is a placeholder, consent can't be
   *  validly given, so the gate stays closed (matches the server's fail-closed
   *  rule) — the customer sees why. */
  const consentReady = !!legal && !legal.placeholder;
  const consentSatisfied = !standalone || (consentReady && consentChecked);
  const valid = emailValid && messageLength >= MIN_MESSAGE && consentSatisfied;

  async function submit() {
    if (!service || !valid || status === "sending") return;
    setStatusBoth("sending");
    try {
      const res = await fetch("/api/portal/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: service.slug,
          serviceName: service.name,
          name: name.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
          // The pinned legal version the customer ticked (customer host only).
          // The server re-validates it against the live published version and
          // refuses to store PII without a valid, current match.
          consentVersion: standalone ? legal?.version : undefined,
          // The honeypot rides along untouched; the server silently drops
          // any submission where a "visitor" filled it in.
          website,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (res.ok && json?.ok) {
        // Success is tracked manually — a raw click on the submit button says
        // nothing about whether the enquiry actually landed. Demo mode
        // (`mode:"demo"`) counts too: the visitor saw a thank-you.
        track("portal_inquiry_submit", { service: service.slug });
        // Behavioural consent log (customer host only, per the funnel's host
        // discrimination). The AUTHORITATIVE consent record is the server-side
        // consent_version on the stored enquiry row; this event is complementary
        // — a timestamped, attributed "they ticked it" signal for the admin
        // telemetry. Never fired from the internal demo tab.
        if (standalone && legal?.version) {
          track("consent_accept", { version: legal.version, scope: "enquiry", service: service.slug });
        }
        setStatusBoth("sent");
      } else {
        setStatusBoth("error");
      }
    } catch {
      /* network down / blocked — the form keeps everything they typed */
      setStatusBoth("error");
    }
  }

  const mailtoFallback = service
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        `APMG Services enquiry — ${service.name}`,
      )}&body=${encodeURIComponent(message)}`
    : "#";

  return (
    <AnimatePresence>
      {service && (
        <>
          <motion.div
            className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          {/* This full-viewport wrapper sits ABOVE the z-[80] backdrop, so it —
              not the backdrop — receives every click outside the dialog card.
              Close on those (currentTarget check keeps clicks inside the card,
              which bubble up here, from dismissing) — the spec's backdrop-close. */}
          <div
            className="fixed inset-0 z-[81] flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-label={`Enquire about ${service.name}`}
              tabIndex={-1}
              className="w-[min(94vw,460px)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none"
              initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
              transition={{ duration: reduce ? 0 : 0.32, ease: EASE }}
            >
              {/* header */}
              <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-solid text-primary-foreground">
                  <service.icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading text-base font-semibold text-foreground">
                    Enquire — {service.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Tell us a bit about what you need and our team will take it from there.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {status === "sent" ? (
                /* success state — the body swaps wholesale, no lingering form */
                <div role="status" className="flex flex-col items-center px-5 py-10 text-center">
                  <motion.div
                    initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: reduce ? 0 : 0.32, ease: EASE }}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-solid text-primary-foreground shadow-lg"
                  >
                    <CircleCheck className="h-6 w-6" aria-hidden />
                  </motion.div>
                  <h3 className="mt-3 font-heading text-base font-semibold text-foreground">
                    Enquiry sent
                  </h3>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Thanks — our team will be in touch within one business day.
                  </p>
                  <Button
                    ref={doneRef}
                    size="sm"
                    onClick={onClose}
                    data-track="portal_inquiry_done"
                    data-track-service={service.slug}
                    className="mt-5 bg-primary-solid text-primary-foreground hover:bg-primary-solid/90"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                /* noValidate: our inline validation gates the submit button, so
                   the browser's native bubbles never fight the styled states */
                <form
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  {/* body — capped height so the modal survives short viewports */}
                  <div className="max-h-[min(62vh,540px)] space-y-4 overflow-y-auto px-5 py-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="enquiry-name"
                        className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                      >
                        Name
                      </label>
                      <input
                        id="enquiry-name"
                        ref={nameRef}
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="enquiry-email"
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                      >
                        Work email <span className="text-primary">*</span>
                      </label>
                      <input
                        id="enquiry-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => setEmailTouched(true)}
                        aria-invalid={showEmailError || undefined}
                        aria-describedby={showEmailError ? "enquiry-email-error" : undefined}
                        placeholder="you@company.com.au"
                        className={`h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          showEmailError ? "border-destructive" : "border-input"
                        }`}
                      />
                      {showEmailError && (
                        /* --primary is the AA-safe short-red-text state (§15).
                           id wires it to the input via aria-describedby so
                           screen readers announce the REASON, not just
                           aria-invalid's bare "invalid entry". */
                        <p id="enquiry-email-error" className="text-[11px] text-primary">
                          That email doesn&rsquo;t look right — please check it.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="enquiry-phone"
                        className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                      >
                        Phone
                      </label>
                      <input
                        id="enquiry-phone"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Optional — if you'd prefer a call"
                        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="enquiry-message"
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                      >
                        What do you need done? <span className="text-primary">*</span>
                      </label>
                      <textarea
                        id="enquiry-message"
                        required
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                        aria-describedby="enquiry-message-hint"
                        placeholder="A little about the job — the site or property, what needs doing, and when you'd like it done…"
                        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                      {/* One wired hint slot: while the message is under the
                          minimum it says exactly why Send is still disabled
                          (no silently-dead button); otherwise the friendly
                          detail nudge. --primary = AA-safe short red text. */}
                      <p
                        id="enquiry-message-hint"
                        className={`text-[11px] ${showMessageHint ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {showMessageHint
                          ? `A few more words, please — at least ${MIN_MESSAGE} characters so we can point the right tradesperson at it.`
                          : "The more detail the better — it helps us send the right tradesperson."}
                      </p>
                    </div>

                    {/* Consent gate — customer host only. Mandatory active
                        opt-in to the current Terms & Privacy Policy before any
                        PII is collected. The links expand the exact published
                        text inline so consent is informed; the version is
                        pinned onto the submission and re-checked server-side. */}
                    {standalone && (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                        {consentReady ? (
                          <>
                            <label className="flex cursor-pointer items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={consentChecked}
                                onChange={(e) => setConsentChecked(e.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                              />
                              <span className="text-[12px] leading-relaxed text-foreground">
                                I agree to APMG Services&rsquo;{" "}
                                <button
                                  type="button"
                                  onClick={() => setOpenDoc(openDoc === "terms" ? null : "terms")}
                                  className="font-medium text-primary underline underline-offset-2"
                                >
                                  Terms &amp; Conditions
                                </button>{" "}
                                and{" "}
                                <button
                                  type="button"
                                  onClick={() => setOpenDoc(openDoc === "privacy" ? null : "privacy")}
                                  className="font-medium text-primary underline underline-offset-2"
                                >
                                  Privacy Policy
                                </button>
                                , and to APMG contacting me about my enquiry. Please don&rsquo;t
                                include sensitive personal information in your message.
                              </span>
                            </label>
                            {openDoc && legal && (
                              <div
                                className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-3 text-[12px] leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h1]:mb-1 [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:font-semibold [&_p]:mb-2"
                                // Operator-authored, lawyer-reviewed policy text
                                // from the Legal Documents tab (trusted source).
                                dangerouslySetInnerHTML={{
                                  __html: openDoc === "terms" ? legal.termsHtml : legal.privacyHtml,
                                }}
                              />
                            )}
                          </>
                        ) : (
                          /* No published policy (or fetch failed): we cannot
                             validly collect consent, so we say so and the submit
                             stays disabled (fail-closed, matches the server). */
                          <p className="text-[12px] leading-relaxed text-muted-foreground">
                            Our enquiry form is briefly unavailable. Please email us at{" "}
                            <a
                              href={mailtoFallback}
                              className="font-medium text-primary underline underline-offset-2"
                            >
                              {CONTACT_EMAIL}
                            </a>{" "}
                            and we&rsquo;ll help you directly.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Honeypot. Visually hidden and out of the tab order —
                        real visitors never see it, automated form-fillers do,
                        and the server silently drops any submission that
                        carries a value here. Never referenced in visible copy. */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden"
                    >
                      <label htmlFor="enquiry-website">Website</label>
                      <input
                        id="enquiry-website"
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </div>

                    {status === "error" && (
                      /* Red discipline (§15): red icon + solid-surface text,
                         never red text on a /10 tint. The typed values are
                         untouched — this panel only adds a second path out. */
                      <div
                        ref={errorRef}
                        tabIndex={-1}
                        role="alert"
                        className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-background p-3 outline-none"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                        <div className="min-w-0 text-xs leading-relaxed text-foreground">
                          We couldn&rsquo;t send your enquiry just now. Everything you typed is
                          still here — please try again, or{" "}
                          <a
                            href={mailtoFallback}
                            data-track="portal_inquiry_mailto"
                            data-track-service={service.slug}
                            className="font-medium text-primary underline underline-offset-2"
                          >
                            email us directly
                          </a>{" "}
                          and we&rsquo;ll pick it up from there.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* footer */}
                  <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onClose}
                      data-track="portal_inquiry_cancel"
                      data-track-service={service.slug}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!valid || status === "sending"}
                      className="gap-1.5 bg-primary-solid text-primary-foreground hover:bg-primary-solid/90"
                    >
                      {status === "sending" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                      {status === "sending" ? "Sending…" : "Send enquiry"}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
