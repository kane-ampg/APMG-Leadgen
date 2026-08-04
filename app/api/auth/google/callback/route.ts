import { NextResponse } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  allowedDomain,
  exchangeCode,
  redirectUri,
  verifyIdToken,
} from "@/lib/auth/google";
import { assertWorkspaceIdentity, isSafeNextPath } from "@/lib/auth/policy";
import {
  SESSION_COOKIE,
  THEME_SEED_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth/session";
import { upsertOnLogin } from "@/lib/auth/userStore";

export const runtime = "nodejs";

function fail(req: Request, reason: string): Response {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, req.url));
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Read-then-compare the CSRF state. A mismatch means this callback was not
  // started by this browser.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const read = (name: string) =>
    cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];

  const expectedState = read(OAUTH_STATE_COOKIE);
  const verifier = read(OAUTH_VERIFIER_COOKIE);
  const storedNext = read(OAUTH_NEXT_COOKIE);

  if (url.searchParams.get("error")) return fail(req, "google-denied");
  if (!code || !state || !expectedState || state !== expectedState) return fail(req, "bad-state");
  if (!verifier) return fail(req, "bad-state");

  const tokens = await exchangeCode({ code, verifier, redirectUri: redirectUri(req) });
  if (!tokens?.id_token) return fail(req, "exchange-failed");

  const claims = await verifyIdToken(tokens.id_token);
  if (!claims) return fail(req, "invalid-token");

  const identity = assertWorkspaceIdentity(claims, allowedDomain());
  if (!identity.ok) return fail(req, identity.reason);

  const role = await upsertOnLogin({
    email: identity.email,
    name: claims.name,
    picture: claims.picture,
  });

  const next = isSafeNextPath(storedNext) ? (storedNext as string) : "/";
  const res = NextResponse.redirect(new URL(next, req.url));

  res.cookies.set(
    SESSION_COOKIE,
    await signSession({ email: identity.email, name: claims.name, picture: claims.picture }),
    sessionCookieOptions(),
  );
  // Pre-paint theme for this role — reps work in daylight and get light.
  res.cookies.set(THEME_SEED_COOKIE, role === "sales" ? "light" : "dark", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_NEXT_COOKIE]) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  // Belt and braces: kill the old client-set cookies if any browser still holds them.
  res.cookies.set("apmg-role", "", { path: "/", maxAge: 0 });
  res.cookies.set("apmg-user", "", { path: "/", maxAge: 0 });
  return res;
}
