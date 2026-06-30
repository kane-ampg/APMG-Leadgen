import "server-only";
import { type Permission } from "./permissions";
import { isRole, roleCan, type Role } from "./roles";

/**
 * Server-side permission guard for Route Handlers / Server Actions.
 *
 * TEMPORARY role resolution: reads a role hint from the `apmg-role` cookie or
 * `x-apmg-role` header so API routes can be permission-guarded today. REPLACE
 * `resolveRole` with a verified Supabase session lookup before production — a
 * client-set cookie is NOT trustworthy on its own.
 */
export function resolveRole(req: Request): Role | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)apmg-role=([^;]+)/);
  const candidate = match?.[1] ?? req.headers.get("x-apmg-role") ?? null;
  return isRole(candidate) ? candidate : null;
}

export type GuardResult =
  | { ok: true; role: Role }
  | { ok: false; status: 401 | 403; error: string };

/** Returns ok:false with the right status when the caller lacks `perm`. */
export function requirePermission(req: Request, perm: Permission): GuardResult {
  const role = resolveRole(req);
  if (!role) return { ok: false, status: 401, error: "Not authenticated" };
  if (!roleCan(role, perm)) {
    return { ok: false, status: 403, error: `Forbidden — missing permission: ${perm}` };
  }
  return { ok: true, role };
}

/**
 * Convenience for Route Handlers:
 *
 *   const guard = requirePermission(req, "pipeline.import");
 *   if (!guard.ok) return guardResponse(guard);
 */
export function guardResponse(guard: Extract<GuardResult, { ok: false }>): Response {
  return Response.json({ error: guard.error }, { status: guard.status });
}
