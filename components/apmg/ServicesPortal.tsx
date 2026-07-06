"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Droplets,
  Hammer,
  Layers,
  Paintbrush,
  ShieldCheck,
  Sprout,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import heroBg from "@/app/apmgbg.jpg";
import brandLogo from "@/app/icon.png";
import { Reveal } from "./Reveal";
import { Footer } from "./Footer";

/**
 * Customer-facing portal for the Client role (ui-standards §17.8 signal accent,
 * editorial family). A photographic hero over the APMG background image, then a
 * friendly grid of the trades we offer. Every card is a tracked click so the
 * telemetry-as-identity contract carries onto this surface too.
 */

const CONTACT_EMAIL = "kane@apmgservices.com.au";
const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "APMG service enquiry",
)}`;

interface Service {
  slug: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
}

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

export function ServicesPortal() {
  const reduce = useReducedMotion();

  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:px-6">
      {/* ── Hero over the APMG background image ───────────────────────────── */}
      <Reveal y={6}>
        <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
          {/* full, uncropped banner — the whole 1938×899 image fits inside */}
          <div className="relative">
            <Image
              src={heroBg}
              alt=""
              priority
              sizes="100vw"
              placeholder="blur"
              className="h-auto w-full"
            />
            {/* bottom scrim so the white logo reads over the photo */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
            />
            <Image
              src={brandLogo}
              alt="APMG"
              width={240}
              height={184}
              className="absolute bottom-3 left-4 h-14 w-auto drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:bottom-6 sm:left-7 sm:h-24"
            />
          </div>

          {/* copy below the image (editorial §17.8) */}
          <div className="flex flex-col gap-3 p-6 sm:p-8">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-accent px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              APMG Services
            </span>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Our Services
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Everything your property needs, looked after by one trusted team. Pick a
              trade below and we&rsquo;ll take it from there.
            </p>
            <a
              href={CONTACT_MAILTO}
              data-track="services_hero_contact"
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-primary-solid px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-[transform,filter] hover:brightness-110 active:translate-y-px"
            >
              Talk to our team
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
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
            <ServiceCard service={service} reduce={!!reduce} />
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
          <a
            href={CONTACT_MAILTO}
            data-track="services_contact"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary-solid px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-[transform,filter] hover:brightness-110 active:translate-y-px"
          >
            Talk to our team
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </Reveal>

      <Footer />
    </div>
  );
}

function ServiceCard({ service, reduce }: { service: Service; reduce: boolean }) {
  const Icon = service.icon;
  return (
    <motion.a
      href={CONTACT_MAILTO}
      data-track="service_enquiry"
      data-track-service={service.slug}
      whileHover={reduce ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="group relative flex h-full flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:ring-primary/40"
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
    </motion.a>
  );
}
