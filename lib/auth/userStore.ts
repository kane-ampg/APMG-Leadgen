import { supabaseTarget } from "@/lib/pipeline/server";
import { MAIN_ADMIN_EMAIL } from "@/lib/auth/policy";
import { isRole, type Role } from "@/lib/rbac/roles";

/**
 * All app_users access. Server-only (uses the service-role key).
 *
 * DEMO MODE: local development frequently runs without Supabase configured
 * (supabaseTarget() -> "demo"), and auth must not hard-fail there or the app
 * becomes undevelopable. In demo mode the main admin resolves to admin and
 * every other authenticated address to pending, with no persistence.
 */

const TABLE = "app_users";

function authHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function demoRole(email: string): Role {
  return email.trim().toLowerCase() === MAIN_ADMIN_EMAIL ? "admin" : "pending";
}

/** The user's stored role. Unknown or unreadable resolves to `pending` — the
 *  failure direction must be "no access", never "admin". */
export async function getUserRole(email: string): Promise<Role> {
  const key = email.trim().toLowerCase();
  const target = supabaseTarget();
  if (target.state !== "ok") return demoRole(key);
  try {
    const res = await fetch(
      `${target.base}/rest/v1/${TABLE}?email=eq.${encodeURIComponent(key)}&select=role&limit=1`,
      { headers: authHeaders(target.key), cache: "no-store" },
    );
    if (!res.ok) return "pending";
    const rows = (await res.json().catch(() => [])) as Array<{ role: string }>;
    const role = rows[0]?.role;
    return isRole(role) ? role : "pending";
  } catch {
    return "pending";
  }
}

/**
 * Record a sign-in: create the row on first sight (at the column's `pending`
 * default), refresh the profile fields, stamp `last_login_at`.
 *
 * `role` is NEVER written here, and that is structural, not incidental.
 * `getUserRole` collapses every failure — 5xx, rate limit, schema-cache reload,
 * a dropped connection — into `"pending"`, which is indistinguishable from a
 * genuinely pending user. Reading the role and writing it back through an
 * upsert would therefore demote a real admin to `pending` on a transient blip
 * during their own sign-in, locking out the very account that must never be
 * lockable. Splitting this into an insert that ignores conflicts plus a PATCH
 * that omits `role` makes that class of bug impossible rather than guarded
 * against: no code path here can write the column at all. Roles change only by
 * explicit admin action.
 */
export async function upsertOnLogin(u: {
  email: string;
  name?: string;
  picture?: string;
}): Promise<Role> {
  const email = u.email.trim().toLowerCase();
  const target = supabaseTarget();
  if (target.state !== "ok") return demoRole(email);

  // First sight only. `ignore-duplicates` leaves an existing row untouched, so
  // a returning user's stored role is never in the write path.
  try {
    const res = await fetch(`${target.base}/rest/v1/${TABLE}?on_conflict=email`, {
      method: "POST",
      headers: {
        ...authHeaders(target.key),
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify([{ email }]),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[auth] app_users insert ${res.status}:`, detail.slice(0, 500));
    }
  } catch (e) {
    console.error("[auth] app_users insert failed:", e);
  }

  // Profile refresh — deliberately no `role` key in this body.
  try {
    const res = await fetch(
      `${target.base}/rest/v1/${TABLE}?email=eq.${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(target.key),
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          name: u.name ?? null,
          picture_url: u.picture ?? null,
          last_login_at: new Date().toISOString(),
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[auth] app_users profile refresh ${res.status}:`, detail.slice(0, 500));
    }
  } catch (e) {
    console.error("[auth] app_users profile refresh failed:", e);
  }

  // Read the role back rather than assuming it. A failure here returns
  // "pending", which is only used to seed the starting theme — never persisted
  // — so a blip costs a dark theme, not an account.
  return getUserRole(email);
}
