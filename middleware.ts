import { NextResponse, type NextRequest } from "next/server";

/**
 * Host wall for the customer-facing deployment.
 *
 * The whole app (admin DashboardShell at `/`, plus /api/pipeline, /api/sales,
 * etc.) and the customer services portal (/portal, /t/[id], /api/portal/*) ship
 * from ONE codebase. The admin console lives on its own Vercel project/domain;
 * the customer portal is a SEPARATE Vercel project bound to a customer host.
 *
 * On the customer host we must expose ONLY the portal surface. Everything else
 * (the admin dashboard and its data APIs) is walled off so a recipient who
 * edits the URL from /portal to / cannot reach the console or export leads.
 *
 * Discrimination is by hostname. Any host listed in CUSTOMER_HOSTS (or matching
 * CUSTOMER_HOST_SUFFIX) is treated as customer-only; every other host (the admin
 * project, localhost dev) gets the full app unchanged. This deliberately
 * fails OPEN to full-app only for hosts we don't recognise as customer hosts —
 * so set the env vars on the customer project.
 */

// Exact customer hostnames (comma-separated env override wins). The Vercel
// project URL is the default; add a custom domain here once it's attached.
const CUSTOMER_HOSTS = (process.env.CUSTOMER_PORTAL_HOSTS ||
  "customers-apmg-services.vercel.app")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

// Optional suffix match so Vercel preview deploys of the customer project
// (…-git-….vercel.app) are also locked down. Set to the project slug prefix.
const CUSTOMER_HOST_SUFFIX = (process.env.CUSTOMER_PORTAL_HOST_SUFFIX || "")
  .trim()
  .toLowerCase();

/** Path prefixes the customer portal legitimately needs. Anything not matching
 *  is treated as admin-only and blocked on a customer host. */
const PORTAL_ALLOW = [
  "/portal",
  "/t/", // attribution hook /t/<leadId>
  "/api/portal/", // events, inquiries, summary, lead-activity
];

/**
 * Operator-browser marker (mirrors INTERNAL_COOKIE in lib/portal/server.ts —
 * that module is node-only, and middleware runs on the Edge runtime, so the
 * name is duplicated rather than imported; keep them in sync).
 *
 * Any browser that loads an admin DASHBOARD page gets this cookie — customer
 * hosts never serve those pages, and no client ever browses the console — so
 * "has apmg_internal" is a reliable "this is the operator" signal. The
 * telemetry writers (/api/portal/events, /t/[id], the enquiry event) check it
 * and drop attribution/rows, so the operator clicking their own app (portal
 * previews, test-clicks on tracked links) can't pollute the Telemetry tab's
 * lead trails or funnel totals with self-traffic.
 */
const INTERNAL_COOKIE = "apmg_internal";
const INTERNAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function isCustomerHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0]; // strip any port
  if (CUSTOMER_HOSTS.includes(h)) return true;
  if (CUSTOMER_HOST_SUFFIX && h.endsWith(CUSTOMER_HOST_SUFFIX)) return true;
  return false;
}

function isPortalPath(pathname: string): boolean {
  if (pathname === "/portal") return true;
  return PORTAL_ALLOW.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const { pathname } = req.nextUrl;

  // Not a customer host -> full app (admin project, local dev).
  if (!isCustomerHost(host)) {
    // Dashboard PAGE loads mark the browser internal (see INTERNAL_COOKIE).
    // Portal paths are excluded on purpose — previewing /portal or clicking a
    // /t/ link must not mark anyone, or a real client landing here (e.g. dev /
    // single-project setups) would be silently dropped from telemetry.
    if (
      !isPortalPath(pathname) &&
      !pathname.startsWith("/api/") &&
      !req.cookies.has(INTERNAL_COOKIE)
    ) {
      const res = NextResponse.next();
      res.cookies.set(INTERNAL_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: INTERNAL_COOKIE_MAX_AGE,
      });
      return res;
    }
    return NextResponse.next();
  }

  // Customer host: only portal surface is allowed.
  if (isPortalPath(pathname)) return NextResponse.next();

  // Root and any stray page -> send the customer to the portal.
  if (!pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/portal";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Any non-portal API on the customer host (e.g. /api/pipeline/leads,
  // /api/sales/*) -> hard 404. This is the leak we're closing.
  return new NextResponse("Not found", { status: 404 });
}

// Run on everything except Next internals and static assets, so the wall can't
// be sidestepped via an unmatched route. The matcher excludes _next and files
// with an extension (images, fonts, etc.).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
