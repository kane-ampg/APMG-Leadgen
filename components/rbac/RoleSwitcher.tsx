"use client";

import { cn } from "@/lib/cn";
import { useRbac } from "@/lib/rbac/RbacProvider";
import { ROLES, type Role } from "@/lib/rbac/roles";

/**
 * Dev-only role preview. Lets you see the dashboard as each role without auth.
 * Renders nothing in production (role comes from the session there). Reserved
 * roles (sales) appear disabled so the reserved state is visible.
 */
export function RoleSwitcher() {
  const { role, setRole, devMode } = useRbac();
  if (!devMode) return null;

  return (
    <div className="rounded-md border border-dashed border-border bg-background/40 p-1.5">
      <div className="mb-1 px-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Preview role · dev
      </div>
      <div className="flex gap-1">
        {(Object.keys(ROLES) as Role[]).map((r) => {
          const def = ROLES[r];
          const isActive = r === role;
          return (
            <button
              key={r}
              type="button"
              disabled={!def.enabled}
              onClick={() => def.enabled && setRole(r)}
              data-track="dev_role_switch"
              data-track-role={r}
              aria-pressed={isActive}
              title={def.enabled ? def.description : `${def.label} — reserved`}
              className={cn(
                "flex-1 rounded px-1.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                isActive
                  ? "bg-primary-solid text-primary-foreground"
                  : def.enabled
                    ? "bg-muted text-muted-foreground hover:text-foreground"
                    : "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              {def.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
