/**
 * Permission catalog — the atomic capabilities in the system. Roles are just
 * named bundles of these (see roles.ts), so adding a role never touches
 * enforcement code, and enforcement always checks a PERMISSION, never a role.
 *
 * Naming: `resource.action`.
 */
export const PERMISSIONS = {
  "overview.view": "View the overview dashboard",
  "pipeline.view": "View the lead pipeline",
  "pipeline.import": "Import leads from a CSV",
  "sources.view": "View lead sources",
  "campaigns.view": "View campaigns",
  "campaigns.send": "Send an outreach email campaign to leads",
  "integrations.view": "View integrations",
  "integrations.manage": "Create, pause, and reconnect automations",
  "telemetry.view": "View click telemetry",
  "settings.view": "View settings",
  "settings.manage": "Change settings",
  "leads.view": "View leads",
  "leads.export": "Export leads",
  "leads.contact": "Contact a lead (call / email / mark contacted)",
  "leads.close": "Close a lead (won / lost)",
  "sales.view": "View the sales queue of qualified, emailed leads",
  "users.manage": "Manage users and roles",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function permissionLabel(perm: Permission): string {
  return PERMISSIONS[perm];
}
