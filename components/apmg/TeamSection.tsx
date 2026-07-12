"use client";

import Image, { type StaticImageData } from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Linkedin } from "lucide-react";
import { Reveal } from "./Reveal";
import { SignalLed } from "./SignalLed";

// Headshots self-hosted in the repo (app/team/*), normalised to a square
// 640×640 crop so the roster reads as one cohesive rail. Static-imported like
// the hero background so Next optimises them and hands us a blur placeholder —
// no dependency on APMG's WordPress CDN staying up, which matters on a trust
// page.
import farbod from "@/app/team/farbod-mollaei.jpg";
import zac from "@/app/team/zac-karannagoda.jpg";
import fred from "@/app/team/fred-mollaei.jpg";
import craig from "@/app/team/craig-billing.jpg";
import ashley from "@/app/team/ashley-rankin.jpg";
import simon from "@/app/team/simon-taranek.jpg";
import chamz from "@/app/team/chamz-abeyratne.jpg";
import aiicha from "@/app/team/aiicha-robertson.jpg";
import jack from "@/app/team/jack-wilson.jpg";

/**
 * "Our Crew" — the customer-facing team roster (ui-standards §17.8).
 *
 * DESIGN INTENT (frontend-design pass, in-system): the rest of this product
 * treats everything as a live, instrumented system — the SignalTicker asserts
 * "Signal live · N pings", the SignalLed pulses. So the team surface is framed
 * as the OPERATION'S ROSTER, not a generic avatar grid: an instrument header
 * that tallies the crew ("09 ACTIVE") with the same pulsing LED and tnum
 * figures as the ticker, tiers as labelled register sections, and each person
 * as a NODE carrying a mono roster index (03/09) and a truthful "Active"
 * readout. The operator voice lives entirely in the CHROME (the mono captions,
 * the index, the tally); the photo + name stay large and warm so the page
 * still does its real job — earning trust with real, accountable faces.
 *
 * Every colour is a token (§17.8 red discipline): Signal Red is rationed to the
 * LED, the roster index, and a hairline that lights on hover; everything else is
 * steel (--muted-foreground) on graphite (--card). No new hues.
 *
 * Deliberately presentational: no funnel contract events fire from here (a face
 * isn't a service enquiry). LinkedIn links, where the person lists one, carry a
 * plain `data-track="portal_team_linkedin"` so an outbound click still shows in
 * the ticker without touching the Enquiries funnel.
 */

interface Member {
  name: string;
  role: string;
  photo: StaticImageData;
  /** public LinkedIn profile, when the person lists one */
  linkedin?: string;
}

interface TeamGroup {
  /** register label + its short code, e.g. "Leadership" / "LEAD" */
  label: string;
  code: string;
  members: Member[];
}

const TEAM: TeamGroup[] = [
  {
    label: "Leadership",
    code: "LEAD",
    members: [
      {
        name: "Farbod Mollaei",
        role: "Managing Director",
        photo: farbod,
        linkedin: "https://www.linkedin.com/in/farbod-mollaei-0298199b/",
      },
      {
        name: "Zac Karannagoda",
        role: "Assistant General Manager",
        photo: zac,
        linkedin: "https://www.linkedin.com/in/zac-karannagoda-ba8a6368/",
      },
    ],
  },
  {
    label: "Management",
    code: "MGMT",
    members: [
      { name: "Fred Mollaei", role: "Project Manager", photo: fred },
      {
        name: "Craig Billing",
        role: "Head of Projects",
        photo: craig,
        linkedin: "https://www.linkedin.com/in/craig-billing-b2583061/",
      },
      {
        name: "Ashley Rankin",
        role: "Service Manager",
        photo: ashley,
        linkedin: "https://www.linkedin.com/in/ashley-rankin-4bb900255/",
      },
      {
        name: "Simon Taranek",
        role: "Senior Business Development Manager",
        photo: simon,
      },
      {
        name: "Chamz Abeyratne",
        role: "Human Resources Manager",
        photo: chamz,
        linkedin: "https://www.linkedin.com/in/chamika-a-26a56682/",
      },
    ],
  },
  {
    label: "Account Managers",
    code: "AM",
    members: [
      { name: "Aiicha Robertson", role: "Account Manager — PPM", photo: aiicha },
      { name: "Jack Wilson", role: "Account Manager — Reactive", photo: jack },
    ],
  },
];

/** Total heads — drives the "N ACTIVE" tally and the roster denominator. */
const CREW_SIZE = TEAM.reduce((n, g) => n + g.members.length, 0);
/** 2-digit zero-pad for the mono readouts (09, not 9), matching the console. */
const pad2 = (n: number) => n.toString().padStart(2, "0");

export function TeamSection() {
  const reduce = useReducedMotion();
  // Continuous 1-based index across every tier so each node's "03 / 09" is a
  // truthful position in the whole crew, not a per-group counter.
  let seq = 0;

  return (
    <section aria-label="Our crew">
      {/* ── Instrument header ────────────────────────────────────────────────
          Borrows the SignalTicker's exact voice (LED + mono tnum tally) so the
          roster reads as a live readout of the operation, not a photo wall. */}
      <Reveal delay={0.04} className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <SignalLed />
              Our crew
            </div>
            <h2 className="mt-1.5 font-heading text-lg font-semibold tracking-tight text-foreground">
              The people behind every job
            </h2>
          </div>
          {/* the tally — same tnum + tracking as "N pings" in the ticker */}
          <div
            className="flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
            aria-label={`${CREW_SIZE} people on the crew`}
          >
            <span className="tnum text-xl font-semibold not-italic tracking-normal text-foreground sm:text-2xl">
              {pad2(CREW_SIZE)}
            </span>
            active
          </div>
        </div>
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
          Real people who&rsquo;ll look after your property — the same faces
          you&rsquo;ll deal with from the first call to the job done.
        </p>
      </Reveal>

      <div className="flex flex-col gap-8">
        {TEAM.map((group, gi) => (
          <div key={group.label}>
            {/* Register label: code chip + name, then a hairline to the edge and
                the tier's own head-count. Structural, not decorative. */}
            <Reveal delay={0.06 + gi * 0.03} className="mb-4 flex items-center gap-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                {group.code}
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {group.label}
              </span>
              <span aria-hidden className="h-px flex-1 bg-border" />
              <span className="tnum font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                {pad2(group.members.length)}
              </span>
            </Reveal>

            {/* flex-wrap + justify-center so a short tier (Leadership and Account
                Managers each have 2) centres instead of sitting flush-left with a
                lopsided gap; full tiers still pack tight. Fixed responsive basis
                reproduces a 2 / 3 / 4-up track (gap-3 gutters subtracted). */}
            <div className="flex flex-wrap justify-center gap-3">
              {group.members.map((member, mi) => {
                seq += 1;
                return (
                  <Reveal
                    key={member.name}
                    delay={Math.min(0.08 + gi * 0.03 + mi * 0.03, 0.34)}
                    y={12}
                    className="basis-[calc(50%-0.375rem)] sm:basis-[calc(33.333%-0.5rem)] lg:basis-[calc(25%-0.5625rem)]"
                  >
                    <MemberNode member={member} index={seq} reduce={!!reduce} />
                  </Reveal>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MemberNode({
  member,
  index,
  reduce,
}: {
  member: Member;
  index: number;
  reduce: boolean;
}) {
  return (
    <motion.div
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-card ring-1 ring-border transition-colors hover:ring-primary/40"
    >
      {/* Top signal hairline — dim by default, ignites Signal Red on hover. The
          single moving accent per node (§17.8: red on the solid panel edge). */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-primary/20 transition-colors duration-300 group-hover:bg-primary"
      />

      {/* Roster index — the node's honest position in the crew (03 / 09), in the
          console's mono voice. Sits top-right so the eye reads face first. */}
      <span
        aria-hidden
        className="absolute right-3 top-3 tnum font-mono text-[10px] font-semibold tracking-wider text-muted-foreground/60"
      >
        <span className="text-primary">{pad2(index)}</span>
        <span className="text-muted-foreground/40">/{pad2(CREW_SIZE)}</span>
      </span>

      <div className="flex flex-1 flex-col items-center px-4 pb-4 pt-6 text-center">
        {/* Portrait — kept large and warm: the human counterpoint to the cold
            chassis. Double ring (bezel + faint red) reads as a seated node. */}
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-1 ring-border sm:h-28 sm:w-28">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-inset ring-primary/10 transition-[box-shadow] duration-300 group-hover:ring-primary/40"
          />
          <Image
            src={member.photo}
            alt={`${member.name}, ${member.role}`}
            fill
            placeholder="blur"
            sizes="(min-width: 640px) 112px, 96px"
            className="object-cover"
          />
        </div>

        <h3 className="mt-4 font-heading text-sm font-semibold leading-snug text-foreground">
          {member.name}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {member.role}
        </p>
      </div>

      {/* Node footer — a truthful "ACTIVE" readout (everyone shown IS on the
          crew; no invented field/office claim) + LinkedIn, split by a hairline
          so card bottoms align across a row regardless of role length. The dot
          rests steady/dim and ignites Signal Red on hover, the same "comes
          online" language as the top hairline — red stays rationed (§17.8). */}
      <div className="mt-auto flex items-center justify-between border-t border-border/70 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 transition-[background-color,box-shadow] duration-300 group-hover:bg-primary group-hover:shadow-[0_0_6px_hsl(var(--primary)/0.7)]"
          />
          Active
        </span>

        {member.linkedin ? (
          <a
            href={member.linkedin}
            target="_blank"
            rel="noreferrer"
            data-track="portal_team_linkedin"
            data-track-person={member.name}
            aria-label={`${member.name} on LinkedIn`}
            className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
          >
            <Linkedin className="h-3 w-3" aria-hidden />
            LinkedIn
          </a>
        ) : (
          // keep the footer height identical when there's no profile link
          <span aria-hidden className="h-3 w-3" />
        )}
      </div>
    </motion.div>
  );
}
