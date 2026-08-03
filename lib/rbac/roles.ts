import { ALL_PERMISSIONS, type Permission } from "./permissions";

/**
 * A role is a named bundle of permissions — nothing more. Enforcement checks
 * permissions, so new roles are pure data and need no logic changes.
 */
export type Role = "admin" | "client" | "sales" | "pending";

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
    description: "Customer portal — browse services, view and export delivered leads.",
    enabled: true,
    permissions: ["services.view", "overview.view", "leads.view", "leads.export"],
  },
  sales: {
    label: "Sales",
    description: "Sales reps work the qualified-lead queue: call, email, and close.",
    enabled: true,
    permissions: [
      "overview.view",
      "sales.view",
      // Deliberately NO `leads.view`: reps work the handed-over queue, not the
      // whole lead database, so the Leads tab stays off their dashboard.
      // `leads.contact`/`leads.close` are the actions they take on queue rows.
      "leads.contact",
      "leads.close",
      "leads.export",
      // Portal enquiries are inbound qualified leads — reps triage them too.
      "enquiries.view",
      "enquiries.manage",
    ],
  },
  pending: {
    label: "Pending",
    description:
      "Signed in, but no access yet — an admin must grant a role. This is where every auto-admitted Workspace account lands.",
    enabled: true,
    permissions: [],
  },
};

/** Fallback role when no session is present. Deliberately powerless: a code
 *  path that cannot resolve a role must grant nothing, not everything. */
export const DEFAULT_ROLE: Role = "pending";

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
