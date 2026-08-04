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

/** Create the row on first sight at `pending`, refresh the profile fields, and
 *  stamp last_login_at. Never downgrades an existing role. */
export async function upsertOnLogin(u: {
  email: string;
  name?: string;
  picture?: string;
}): Promise<Role> {
  const email = u.email.trim().toLowerCase();
  const target = supabaseTarget();
  if (target.state !== "ok") return demoRole(email);

  const existing = await getUserRole(email);
  const body = [
    {
      email,
      name: u.name ?? null,
      picture_url: u.picture ?? null,
      // Send the role we already have so the upsert cannot reset it.
      role: existing,
      last_login_at: new Date().toISOString(),
    },
  ];
  try {
    const res = await fetch(`${target.base}/rest/v1/${TABLE}?on_conflict=email`, {
      method: "POST",
      headers: {
        ...authHeaders(target.key),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[auth] app_users upsert ${res.status}:`, detail.slice(0, 500));
    }
  } catch (e) {
    console.error("[auth] app_users upsert failed:", e);
  }
  return existing;
}
