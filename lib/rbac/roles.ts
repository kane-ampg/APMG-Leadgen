import { ALL_PERMISSIONS, type Permission } from "./permissions";

/**
 * A role is a named bundle of permissions — nothing more. Enforcement checks
 * permissions, so new roles are pure data and need no logic changes.
 *
 * `sales` is defined (so enforcement is ready the day it's switched on) but
 * marked `enabled: false` — it is reserved and not yet assignable.
 */
export type Role = "admin" | "client" | "sales";

export interface RoleDef {
  label: string;
  description: string;
  /** reserved roles are defined but not yet assignable in the UI */
  enabled: boolean;
  permissions: readonly Permission[];
}

export const ROLES: Record<Role, RoleDef> = {
  admin: {
    label: "Admin",
    description: "Full access to the internal lead-gen console.",
    enabled: true,
    permissions: ALL_PERMISSIONS,
  },
  client: {
    label: "Client",
    description: "Customer portal — view and export delivered leads.",
    enabled: true,
    permissions: ["overview.view", "leads.view", "leads.export"],
  },
  sales: {
    label: "Sales",
    description: "Sales reps work the qualified-lead queue: call, email, and close.",
    enabled: true,
    permissions: [
      "overview.view",
      "sales.view",
      "leads.view",
      "leads.contact",
      "leads.close",
      "leads.export",
    ],
  },
};

/** Fallback role when no session is present (internal console default). */
export const DEFAULT_ROLE: Role = "admin";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLES;
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLES[role]?.permissions ?? [];
}

/** The single source of truth for every access decision. */
export function roleCan(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

/** Roles a UI may currently assign — excludes reserved/disabled roles (sales). */
export function assignableRoles(): Role[] {
  return (Object.keys(ROLES) as Role[]).filter((r) => ROLES[r].enabled);
}
