"use client";

import * as React from "react";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { authenticate } from "@/lib/auth/users";
import { setSessionCookies } from "@/lib/auth/session";
import brandLogo from "@/app/icon.png";
import photoMakeSafe from "@/app/services/make-safe.png";
import photoPreventive from "@/app/services/preventive.png";
import photoPlumbing from "@/app/services/plumbing.png";
import photoElectrical from "@/app/services/electrical.png";
import photoPainting from "@/app/services/painting.png";
import photoCarpentry from "@/app/services/carpentry.png";
import photoFlooring from "@/app/services/flooring.png";
import photoGardening from "@/app/services/gardening.png";
import photoHandyman from "@/app/services/handyman.png";

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const SLIDES = [
  { src: photoMakeSafe, label: "Property Make Safe" },
  { src: photoPreventive, label: "Preventive Maintenance" },
  { src: photoPlumbing, label: "Plumbing" },
  { src: photoElectrical, label: "Electrical" },
  { src: photoPainting, label: "Painting" },
  { src: photoCarpentry, label: "Carpentry" },
  { src: photoFlooring, label: "Flooring" },
  { src: photoGardening, label: "Gardening" },
  { src: photoHandyman, label: "Handyman" },
] as const;

const SLIDE_MS = 4000;

/** Google "G" mark, inlined so the page stays asset-free. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.27a12 12 0 0 0 0 10.76l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44A11.98 11.98 0 0 0 1.27 6.62l4.01 3.09C6.22 6.87 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

/** Microsoft four-square mark, inlined so the page stays asset-free. */
function MicrosoftMark() {
  return (
    <svg viewBox="0 0 23 23" className="h-4 w-4 shrink-0" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

/**
 * Ken-Burns crossfade of the APMG service photos. Every slide stays mounted
 * (stacked, opacity-toggled) so transitions never flash a loading frame.
 */
function ServiceSlideshow() {
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative hidden border-l border-border bg-card lg:block">
      {SLIDES.map((slide, i) => (
        <div
          key={slide.label}
          aria-hidden={i !== active}
          className={cn(
            "absolute inset-0 overflow-hidden transition-opacity duration-1000 ease-out",
            i === active ? "opacity-100" : "opacity-0",
          )}
        >
          {/* Blurred cover backdrop fills the tall panel so the letterboxed
              photo above never sits on empty space. */}
          <Image
            src={slide.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 40rem, 100vw"
            quality={50}
            priority={i === 0}
            aria-hidden
            className="scale-110 object-cover blur-lg brightness-[0.55] saturate-[1.15]"
          />
          {/* The photo itself — object-contain, so it always fits whole,
              uncropped and at its native aspect ratio. */}
          <Image
            src={slide.src}
            alt={slide.label}
            fill
            // Over-request on purpose: the sources are ~870px wide, so this
            // makes Next serve them at full resolution instead of a smaller
            // bucket that retina screens would upscale into mush.
            sizes="(min-width: 1024px) 60rem, 100vw"
            quality={90}
            priority={i === 0}
            className={cn(
              "object-contain [transition:transform_5s_ease-out]",
              // Gentle drift while on screen (motion-safe only) — kept subtle
              // because upscaling is what reads as blur.
              i === active ? "motion-safe:scale-[1.03]" : "scale-100",
            )}
          />
        </div>
      ))}

      {/* scrim + caption */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-12">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
          APMG Services
        </div>
        {/* caption crossfades with its slide */}
        <div className="relative mt-0.5 h-5">
          {SLIDES.map((slide, i) => (
            <span
              key={slide.label}
              className={cn(
                "absolute inset-0 truncate font-heading text-sm font-semibold text-white transition-opacity duration-1000 ease-out",
                i === active ? "opacity-100" : "opacity-0",
              )}
            >
              {slide.label}
            </span>
          ))}
        </div>
        {/* progress dots */}
        <div className="mt-2.5 flex gap-1.5">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.label}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${slide.label}`}
              aria-current={i === active}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === active ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password to sign in.");
      return;
    }
    const user = authenticate(email, password);
    if (!user) {
      setError("Invalid email or password.");
      return;
    }
    setError(null);
    setSubmitting(true);
    // The user's fixed role (sales for the test reps) travels via cookies the
    // server page reads — a full navigation so it re-renders with the session.
    setSessionCookies(user);
    window.location.assign("/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      {/* One connected card: form on the left, service slideshow on the right,
          sharing a single border and radius. */}
      {/* Image column gets the lion's share of the width — the form keeps a
          fixed comfortable measure and the photos stretch wide beside it. */}
      <div className="grid w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[24rem_minmax(0,1fr)]">
        {/* Sign-in panel — the form sets the card's height (min-h + roomier
            spacing); the image column just object-covers whatever it gets. */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex min-h-[38rem] flex-col justify-center p-6 sm:px-10 sm:py-12"
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            {/* Same white-wordmark-on-red tile as the sidebar (§17.8). */}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-solid">
              <Image
                src={brandLogo}
                alt="APMG"
                width={36}
                height={28}
                priority
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                Sign in to APMG
              </h1>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Lead generation
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@apmgservices.com.au"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(inputClass, "pr-10")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" disabled={submitting} className="w-full">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Sign in
            </Button>

            {/* SSO placeholders — not wired to a provider yet */}
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                or continue with
              </span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                title="Single sign-on coming soon"
                className="w-full"
              >
                <GoogleMark />
                Sign in with Google SSO
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                title="Single sign-on coming soon"
                className="w-full"
              >
                <MicrosoftMark />
                Microsoft Entra ID
              </Button>
            </div>
          </div>
        </form>

        {/* Rotating service-photo panel (desktop only) */}
        <ServiceSlideshow />
      </div>
    </main>
  );
}
