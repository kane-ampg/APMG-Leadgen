"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Droplets,
  Globe,
  Hammer,
  Layers,
  MapPin,
  MessageSquare,
  Paintbrush,
  ShieldCheck,
  Sprout,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import heroBg from "@/app/apmgbg.jpg";
import brandLogo from "@/app/icon.png";
import { track } from "@/lib/telemetry";
import { Reveal } from "./Reveal";
import { Footer } from "./Footer";
import { ServiceInquiryModal } from "./ServiceInquiryModal";

/**
 * Customer-facing portal (ui-standards §17.8 signal accent, editorial family).
 * A photographic hero over the APMG background image, then a friendly grid of
 * the trades we offer. Serves two hosts unchanged: the "Our Services" tab
 * inside DashboardShell, and the public standalone /portal route where tracked
 * outreach links land.
 *
 * Event contract (see the portal-telemetry spec):
 *  - `portal_view`          — tracked once per mount (the funnel step between
 *                             the outreach click and a service open)
 *  - `portal_service_open`  — every card + both "Talk to our team" CTAs, via
 *                             data-track with `service` as the slug prop
 *  - `portal_inquiry_submit`— tracked by ServiceInquiryModal on a landed submit
 * Cards used to be mailto: links; they now open the enquiry modal so the lead's
 * details land in Supabase instead of an unmeasured mail client hand-off.
 *
 * HOST DISCRIMINATION: the two funnel contract events above are only emitted
 * when `standalone` (the public /portal host where outreach links land). The
 * internal "Our Services" tab inside DashboardShell mounts this same component,
 * and letting it fire the contract names would let an admin demoing the tab
 * inflate every Enquiries-tab conversion ratio with visits no customer made —
 * internal opens are tagged `services_card_open` instead (summary ignores it).
 */

interface Service {
  slug: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
}

/**
 * Pseudo-service for the hero + closing CTAs — the "not sure which trade"
 * path. Same shape as a real service so the modal and the event contract
 * treat it uniformly (slug `general`).
 */
const GENERAL_SERVICE: Service = {
  slug: "general",
  name: "General enquiry",
  blurb: "Not sure which trade you need? Tell us what's going on and we'll sort the rest.",
  icon: MessageSquare,
};

/** Services from the APMG site — "Melbourne" trimmed, copy warmed up. */
const SERVICES: Service[] = [
  {
    slug: "electrical",
    name: "Electrical Services",
    blurb: "Safe, certified electrical work — from new power points to full rewires.",
    icon: Zap,
  },
  {
    slug: "painting",
    name: "Painting Services",
    blurb: "Fresh, flawless finishes inside and out, applied with real care.",
    icon: Paintbrush,
  },
  {
    slug: "plumbing",
    name: "Plumbing Services",
    blurb: "Leaks, installs and emergencies sorted fast — and right the first time.",
    icon: Droplets,
  },
  {
    slug: "carpentry",
    name: "Carpentry & Joinery",
    blurb: "Custom-built and expertly repaired timberwork, made to last.",
    icon: Hammer,
  },
  {
    slug: "flooring",
    name: "Flooring Services",
    blurb: "Timber, tile, vinyl and carpet — laid to perfection.",
    icon: Layers,
  },
  {
    slug: "gardening",
    name: "Gardening & Grounds Maintenance",
    blurb: "Lawns, gardens and grounds kept looking their very best.",
    icon: Sprout,
  },
  {
    slug: "handyman",
    name: "Handyman Services",
    blurb: "The odd jobs and quick fixes — all handled in a single call.",
    icon: Wrench,
  },
  {
    slug: "make-safe",
    name: "Property Make Safe Services",
    blurb: "Rapid make-safe and securing after storm damage or a break-in.",
    icon: ShieldCheck,
  },
];

export function ServicesPortal({ standalone = false }: { standalone?: boolean }) {
  const reduce = useReducedMotion();
  /** The service the enquiry modal is open for; null = closed. */
  const [active, setActive] = useState<Service | null>(null);
  /** Contract funnel events fire ONLY on the customer-facing /portal host;
   *  internal (dashboard) opens get a non-contract name the summary ignores. */
  const openEvent = standalone ? "portal_service_open" : "services_card_open";

  // One `portal_view` per mount of the CUSTOMER host — the funnel step between
  // the outreach redirect (attribution_click, recorded server-side by /t/[id])
  // and the first portal_service_open. Deliberately manual: there's no click
  // to delegate on a page view. Internal dashboard mounts are NOT portal
  // visits and must not pollute the funnel.
  useEffect(() => {
    if (standalone) track("portal_view");
  }, [standalone]);

  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:px-6">
      {/* ── Hero over the APMG background image ───────────────────────────── */}
      <Reveal y={6}>
        <section className="relative h-64 overflow-hidden rounded-2xl bg-black ring-1 ring-foreground/10 sm:h-80">
          {/* fixed placeholder; the WHOLE image is fitted (contained) inside it */}
          <Image
            src={heroBg}
            alt=""
            fill
            priority
            sizes="100vw"
            placeholder="blur"
            className="object-contain object-top"
          />
          {/* bottom-weighted scrim: dark lower band for the overlay, clear photo up top */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-primary/15 via-transparent to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 sm:gap-3 sm:p-8">
            <Image
              src={brandLogo}
              alt="APMG"
              width={240}
              height={184}
              className="h-11 w-auto self-start drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:h-20"
            />
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.7)]" />
              APMG Services
            </span>
            <h1 className="max-w-2xl font-heading text-xl font-bold tracking-tight text-white sm:text-4xl">
              Our Services
            </h1>
            <p className="max-w-xl text-xs leading-relaxed text-white/85 sm:text-base">
              Everything your property needs, looked after by one trusted team. Pick a
              trade below and we&rsquo;ll take it from there.
            </p>
            <button
              type="button"
              onClick={() => setActive(GENERAL_SERVICE)}
              data-track={openEvent}
              data-track-service="general"
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-white/95 px-3.5 py-2 text-xs font-semibold text-zinc-900 shadow-sm transition-[transform,background-color] hover:bg-white active:translate-y-px"
            >
              Talk to our team
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </section>
      </Reveal>

      {/* ── Section heading ──────────────────────────────────────────────── */}
      <Reveal delay={0.06} className="mb-4 mt-6">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What we do
        </div>
        <h2 className="mt-1.5 font-heading text-lg font-semibold tracking-tight text-foreground">
          Trades we handle
        </h2>
      </Reveal>

      {/* ── Service cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service, i) => (
          <Reveal
            key={service.slug}
            delay={Math.min(0.08 + i * 0.04, 0.32)}
            y={12}
            className="h-full"
          >
            <ServiceCard
              service={service}
              reduce={!!reduce}
              onOpen={setActive}
              openEvent={openEvent}
            />
          </Reveal>
        ))}
      </div>

      {/* ── Friendly closing CTA ─────────────────────────────────────────── */}
      <Reveal delay={0.16} className="mt-4">
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Not sure where to start?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Tell us what you need and our team will point you the right way — one call
              covers the lot.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActive(GENERAL_SERVICE)}
            data-track={openEvent}
            data-track-service="general"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary-solid px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-[transform,filter] hover:brightness-110 active:translate-y-px"
          >
            Talk to our team
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </Reveal>

      {/* ── Where to find us ─────────────────────────────────────────────── */}
      <Reveal delay={0.2} className="mt-3">
        <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-primary/15">
              <MapPin className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h3 className="font-heading text-sm font-semibold text-foreground">
                APMG Services
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                1 Tesmar Cct, Chirnside Park, VIC, Australia
              </p>
            </div>
          </div>
          <a
            href="https://www.apmgservices.com.au/"
            target="_blank"
            rel="noreferrer"
            data-track="portal_website_click"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden />
            apmgservices.com.au
          </a>
        </div>
      </Reveal>

      {/* Customer host hides the internal Signal Console build tag (§17.8). */}
      <Footer consoleTag={!standalone} />

      {/* Single modal instance shared by every card + CTA on the page. */}
      <ServiceInquiryModal service={active} onClose={() => setActive(null)} />
    </div>
  );
}

function ServiceCard({
  service,
  reduce,
  onOpen,
  openEvent,
}: {
  service: Service;
  reduce: boolean;
  onOpen: (service: Service) => void;
  /** host-aware data-track name: `portal_service_open` only on /portal */
  openEvent: string;
}) {
  const Icon = service.icon;
  // A button, not a mailto link: opening the enquiry modal keeps the lead on
  // the page (and in our data) instead of bouncing them to a mail client.
  // `w-full text-left` compensates for the button's native shrink-to-fit
  // sizing and centred text so the card renders exactly as the <a> did.
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(service)}
      data-track={openEvent}
      data-track-service={service.slug}
      whileHover={reduce ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="group relative flex h-full w-full flex-col gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:ring-primary/40"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-primary/15">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex-1">
        <h3 className="font-heading text-sm font-semibold leading-snug text-foreground">
          {service.name}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {service.blurb}
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-primary">
        Enquire
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </motion.button>
  );
}
