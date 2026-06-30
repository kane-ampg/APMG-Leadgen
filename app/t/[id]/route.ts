import { NextResponse, type NextRequest } from "next/server";

/**
 * Email attribution hook. The automation's outreach email links its CTA to
 * /t/<leadId>?c=<campaign> (see references/Leadgen Automation.json). When the
 * lead clicks, we:
 *   1. record the click (proof the automation worked + that this lead is ours),
 *   2. drop a first-party `apmg_ref` cookie so later pageviews stay attributed,
 *   3. 302-redirect the lead on to the real destination.
 *
 * TODO(supabase): persist the click — set leads.engaged = true, engaged_at = now,
 * and insert an attribution row {lead_id, campaign, ts, ua, referer}. That write
 * is what flips the "Engaged" badge in the Sales queue.
 */

const DEFAULT_DESTINATION = process.env.NEXT_PUBLIC_TRACK_DESTINATION || "/";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const campaign = url.searchParams.get("c") ?? "outreach";
  const destination = url.searchParams.get("to") || DEFAULT_DESTINATION;

  // Server-side record (swap console for a Supabase write — see TODO above).
  console.info("[attribution] lead click", {
    lead: id,
    campaign,
    ts: new Date().toISOString(),
    ua: req.headers.get("user-agent") ?? undefined,
  });

  const res = NextResponse.redirect(new URL(destination, url.origin), { status: 302 });
  res.cookies.set("apmg_ref", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  res.cookies.set("apmg_ref_campaign", campaign, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
