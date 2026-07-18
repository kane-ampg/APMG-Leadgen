"use client";

import { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Briefcase,
  Droplets,
  Globe,
  Hammer,
  Layers,
  MapPin,
  MessageSquare,
  Paintbrush,
  ShieldCheck,
  Sprout,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import heroBg from "@/app/apmgbg.jpg";
import heroTeam from "@/app/apmgteam.jpg";
import brandLogo from "@/app/icon.png";
// Card backgrounds — real APMG job-site photos, self-hosted in the repo
// (app/services/*, mirroring app/team/*) and static-imported so Next optimises
// them and hands us a blur placeholder. Keyed to each service slug below.
import photoElectrical from "@/app/services/electrical.png";
import photoPainting from "@/app/services/painting.png";
import photoPlumbing from "@/app/services/plumbing.png";
import photoCarpentry from "@/app/services/carpentry.png";
import photoFlooring from "@/app/services/flooring.png";
import photoGardening from "@/app/services/gardening.png";
import photoHandyman from "@/app/services/handyman.png";
import photoMakeSafe from "@/app/services/make-safe.png";
import { track } from "@/lib/telemetry";
import { Reveal } from "./Reveal";
import { Footer } from "./Footer";
import { PortalUnsubscribe } from "./PortalUnsubscribe";
import { ServiceInquiryModal } from "./ServiceInquiryModal";
import { TeamSection } from "./TeamSection";

/**
 * Customer-facing portal (ui-standards §17.8 signal accent, editorial family).
 * A photographic hero over the APMG background image, then a two-tab body
 * (§11.1 sliding-pill tabs): "Our Services" — a friendly grid of the trades we
 * offer — and "Our Team" — the faces behind the work, a deliberate trust
 * surface. Serves two hosts unchanged: the "Our Services" tab inside
 * DashboardShell, and the public standalone /portal route where tracked
 * outreach links land.
 *
 * Event contract (see the portal-telemetry spec):
 *  - `portal_view`          — tracked once per mount (the funnel step between
 *                             the outreach click and a service open)
 *  - `portal_service_open`  — every card + both "Talk to our team" CTAs, via
 *                             data-track with `service` as the slug prop
 *  - `portal_inquiry_submit`— tracked by ServiceInquiryModal on a landed submit
 *  - `portal_tab`           — switching the in-page tab (prop `tab`); NON-contract,
 *                             so it never touches the Enquiries funnel
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

/** In-page tabs for the portal body. Order is the pill order. */
const PORTAL_TABS = [
  { key: "services", label: "Our Services", icon: Briefcase },
  { key: "team", label: "Our Team", icon: Users },
] as const;
type PortalTab = (typeof PORTAL_TABS)[number]["key"];

/** Hero title + subtitle per tab — swapped (cross-faded) with the background
 *  image so the whole hero reflects the active section, not just the photo. */
const HERO_COPY: Record<PortalTab, { title: string; subtitle: string }> = {
  services: {
    title: "Our Services",
    subtitle:
      "Everything your property needs, looked after by one trusted team. Pick a trade below and we’ll take it from there.",
  },
  team: {
    title: "Our Team",
    subtitle:
      "The people who’ll actually look after your property — the same faces you’ll deal with from the first call to the job done.",
  },
};

/** Directional crossfade for the tab panels (§11.1): slide toward the pill the
 *  visitor moved to. `dir` +1 = forward (services→team), −1 = back. */
const PANEL_VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -28 : 28 }),
};

interface Service {
  slug: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
  /** Card banner — a real APMG job-site photo. Optional so the pseudo-service
   *  (GENERAL_SERVICE) and the modal, which share this shape, need not carry one. */
  photo?: StaticImageData;
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
    photo: photoElectrical,
  },
  {
    slug: "painting",
    name: "Painting Services",
    blurb: "Fresh, flawless finishes inside and out, applied with real care.",
    icon: Paintbrush,
    photo: photoPainting,
  },
  {
    slug: "plumbing",
    name: "Plumbing Services",
    blurb: "Leaks, installs and emergencies sorted fast — and right the first time.",
    icon: Droplets,
    photo: photoPlumbing,
  },
  {
    slug: "carpentry",
    name: "Carpentry & Joinery",
    blurb: "Custom-built and expertly repaired timberwork, made to last.",
    icon: Hammer,
    photo: photoCarpentry,
  },
  {
    slug: "flooring",
    name: "Flooring Services",
    blurb: "Timber, tile, vinyl and carpet — laid to perfection.",
    icon: Layers,
    photo: photoFlooring,
  },
  {
    slug: "gardening",
    name: "Gardening & Grounds Maintenance",
    blurb: "Lawns, gardens and grounds kept looking their very best.",
    icon: Sprout,
    photo: photoGardening,
  },
  {
    slug: "handyman",
    name: "Handyman Services",
    blurb: "The odd jobs and quick fixes — all handled in a single call.",
    icon: Wrench,
    photo: photoHandyman,
  },
  {
    slug: "make-safe",
    name: "Property Make Safe Services",
    blurb: "Rapid make-safe and securing after storm damage or a break-in.",
    icon: ShieldCheck,
    photo: photoMakeSafe,
  },
];

export function ServicesPortal({ standalone = false }: { standalone?: boolean }) {
  const reduce = useReducedMotion();
  /** The service the enquiry modal is open for; null = closed. */
  const [active, setActive] = useState<Service | null>(null);
  /** Active in-page tab + the direction of the last switch (for the slide). */
  const [tab, setTab] = useState<PortalTab>("services");
  const [dir, setDir] = useState(1);
  /** Contract funnel events fire ONLY on the customer-facing /portal host;
   *  internal (dashboard) opens get a non-contract name the summary ignores. */
  const openEvent = standalone ? "portal_service_open" : "services_card_open";

  function selectTab(next: PortalTab) {
    if (next === tab) return;
    // pill order defines direction so the panel slides the way the eye moved
    const from = PORTAL_TABS.findIndex((t) => t.key === tab);
    const to = PORTAL_TABS.findIndex((t) => t.key === next);
    setDir(to >= from ? 1 : -1);
    setTab(next);
    track("portal_tab", { tab: next });
  }

  // One `portal_view` per mount of the CUSTOMER host — the funnel step between
  // the outreach redirect (attribution_click, recorded server-side by /t/[id])
  // and the first portal_service_open. Deliberately manual: there's no click
  // to delegate on a page view. Internal dashboard mounts are NOT portal
  // visits and must not pollute the funnel.
  useEffect(() => {
    if (standalone) track("portal_view");
  }, [standalone]);

  return (
    // Centred, max-width column so the portal reads as a contained page rather
    // than sprawling edge-to-edge on wide screens (keeps the hero from
    // letterboxing and the card grids from over-stretching).
    <div className="mx-auto flex min-h-full w-full max-w-[105rem] flex-col px-4 py-5 sm:px-6">
      {/* ── Hero over the APMG background image ───────────────────────────── */}
      <Reveal y={6}>
        <section className="relative h-[300px] overflow-hidden rounded-2xl bg-black ring-1 ring-foreground/10 sm:h-[360px]">
          {/* Two hero images stacked, cross-fading on tab change: the depot/fleet
              shot for Services, the team line-up for Our Team. Both show the WHOLE
              image uncropped (object-contain); wherever it doesn't fill the box,
              the section's bg-black shows through as a letterbox bar. The bottom
              scrim keeps the logo + copy legible over either. */}
          {(
            [
              { key: "services", src: heroBg },
              { key: "team", src: heroTeam },
            ] as const
          ).map((layer) => (
            <motion.div
              key={layer.key}
              aria-hidden={tab !== layer.key}
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: tab === layer.key ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <Image
                src={layer.src}
                alt=""
                fill
                priority={layer.key === "services"}
                sizes="(min-width: 896px) 896px, 100vw"
                placeholder="blur"
                className="object-contain object-center"
              />
            </motion.div>
          ))}
          {/* bottom-weighted scrim: dark lower band for the overlay, clear photo up top */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-primary/15 via-transparent to-transparent"
          />

          {/* inset-0 + justify-end keeps the stack bottom-weighted but CLAMPED
              inside the box, so the logo at the top of the stack can never be
              clipped by the section's overflow-hidden (was bottom-0, which let
              a tall stack overflow past the top edge). */}
          <div className="absolute inset-0 flex flex-col justify-end gap-2 p-5 sm:gap-3 sm:p-8">
            <Image
              src={brandLogo}
              alt="APMG"
              width={240}
              height={184}
              className="h-10 w-auto self-start drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:h-16"
            />
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.7)]" />
              APMG Services
            </span>
            {/* Title + subtitle cross-fade with the tab (and the hero image),
                so the whole hero reflects the active section. `grid` stacks the
                outgoing/incoming copy in the same cell during the fade so the
                layout below doesn't jump. */}
            <div className="grid">
              <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={tab}
                  className="col-start-1 row-start-1"
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: reduce ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h1 className="max-w-2xl font-heading text-xl font-bold tracking-tight text-white sm:text-4xl">
                    {HERO_COPY[tab].title}
                  </h1>
                  <p className="mt-2 max-w-xl text-xs leading-relaxed text-white/85 sm:mt-3 sm:text-base">
                    {HERO_COPY[tab].subtitle}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
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

      {/* ── In-page tabs (§11.1 sliding-pill) ────────────────────────────── */}
      <Reveal delay={0.06} className="mb-5 mt-6">
        <div
          role="tablist"
          aria-label="Portal sections"
          className="inline-flex gap-1 rounded-lg bg-card p-1 ring-1 ring-foreground/10"
        >
          {PORTAL_TABS.map((t) => (
            <TabPill
              key={t.key}
              tab={t}
              active={tab === t.key}
              reduce={!!reduce}
              onSelect={() => selectTab(t.key)}
            />
          ))}
        </div>
      </Reveal>

      {/* ── Animated tab panels ──────────────────────────────────────────── */}
      {/* overflow-x-clip (not -hidden) so the directional slide never spawns a
          page scrollbar while keeping the wrapper a non-scroll container.
          px-2 -mx-2 gives the cards ~8px of horizontal bleed room INSIDE the
          clip so their ring, shadow and hover-lift aren't sliced by the clip
          edge (the "cut line" at the outer card edges) — the negative margin
          cancels the padding so the grid's real width is unchanged. pb-2 does
          the same for the bottom shadow. */}
      <div className="-mx-2 overflow-x-clip px-2 pb-2">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={tab}
            custom={dir}
            variants={PANEL_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="tabpanel"
          >
            {tab === "services" ? (
              <ServicesPanel
                reduce={!!reduce}
                onOpen={setActive}
                openEvent={openEvent}
              />
            ) : (
              <TeamSection />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Customer host hides the internal Signal Console build tag (§17.8). */}
      <Footer consoleTag={!standalone} />

      {/* Self-serve opt-out on the customer host only: a fresh portal visitor has
          no address in the URL (unlike the email footer link), so this collects
          it and hands off to the same /api/portal/unsubscribe route. */}
      {standalone && <PortalUnsubscribe />}

      {/* Single modal instance shared by every card + CTA on the page. The
          consent gate + funnel event only apply on the customer host. */}
      <ServiceInquiryModal service={active} onClose={() => setActive(null)} standalone={standalone} />
    </div>
  );
}

/**
 * One tab pill (§11.1). Only the active pill renders the sliding indicator; all
 * pills share the `portal-tab` layoutId so Framer glides the single signal-red
 * element between them. Label + icon sit above the indicator at `z-10`.
 */
function TabPill({
  tab,
  active,
  reduce,
  onSelect,
}: {
  tab: (typeof PORTAL_TABS)[number];
  active: boolean;
  reduce: boolean;
  onSelect: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-[13px]",
        active ? "text-white" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="portal-tab"
          className="absolute inset-0 rounded-md bg-gradient-to-r from-primary to-primary-solid shadow-sm shadow-primary/25"
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <Icon className="relative z-10 h-3.5 w-3.5" aria-hidden />
      <span className="relative z-10">{tab.label}</span>
    </button>
  );
}

/**
 * The "Our Services" panel body: the trades grid plus the address/website card.
 * Split out of ServicesPortal so it can slide in and out as a tab panel while
 * the hero and footer stay put.
 */
function ServicesPanel({
  reduce,
  onOpen,
  openEvent,
}: {
  reduce: boolean;
  onOpen: (service: Service) => void;
  openEvent: string;
}) {
  return (
    <div>
      {/* Section heading */}
      <div className="mb-4">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What we do
        </div>
        <h2 className="mt-1.5 font-heading text-lg font-semibold tracking-tight text-foreground">
          Trades we handle
        </h2>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service, i) => (
          <Reveal
            key={service.slug}
            delay={Math.min(0.05 + i * 0.04, 0.3)}
            y={12}
            className="h-full"
          >
            <ServiceCard
              service={service}
              reduce={reduce}
              onOpen={onOpen}
              openEvent={openEvent}
            />
          </Reveal>
        ))}
      </div>

      {/* Where to find us */}
      <Reveal delay={0.14} className="mt-4">
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
  //
  // Layout: a real APMG job-site PHOTO banner on top (the trust surface — these
  // are our actual crew in branded workwear), then the text block below on the
  // solid card so copy stays fully legible. The category icon sits in a chip
  // that overlaps the banner's lower-left edge, tying photo to text and keeping
  // its role as a quick visual key. overflow-hidden clips the photo to the
  // card's rounded corners.
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(service)}
      data-track={openEvent}
      data-track-service={service.slug}
      whileHover={reduce ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition-colors hover:ring-primary/40"
    >
      {/* Photo banner. Fixed 16:9 box so every card's image reads at the same
          height regardless of the source photo. object-CONTAIN shows the WHOLE
          photo uncropped — nothing is cut off — with the box's bg-muted acting
          as a matte wherever a photo's ratio doesn't exactly fill 16:9 (same
          letterbox approach the hero uses). The subtle zoom on hover echoes the
          card lift; a faint bottom gradient seats the overlapping icon chip. */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {service.photo ? (
          <Image
            src={service.photo}
            alt=""
            fill
            placeholder="blur"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className={cn(
              "object-contain object-center",
              !reduce && "transition-transform duration-500 group-hover:scale-105",
            )}
          />
        ) : null}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent"
        />
      </div>

      {/* Text block on the solid card. -mt-6 pulls the icon chip up so it
          straddles the banner edge; pt keeps the heading clear of it. */}
      <div className="relative flex flex-1 flex-col gap-3 p-4">
        <span className="-mt-11 flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary shadow-sm ring-1 ring-primary/15">
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
      </div>
    </motion.button>
  );
}
