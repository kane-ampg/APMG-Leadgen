"use client";

import { useRef } from "react";
import { LogOut, MoreHorizontal, Radar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/cn";
import { NAV, type TabId } from "@/lib/nav";
import { useLeadStats } from "@/lib/data/useLeadStats";
import { formatInt } from "@/lib/format";
import { useTelemetryCount } from "@/lib/telemetry";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useRbac } from "@/lib/rbac/RbacProvider";
import { RoleSwitcher } from "@/components/rbac/RoleSwitcher";
import { SignalLed } from "./SignalLed";
import { ThemeToggle } from "./ThemeToggle";

interface SidebarProps {
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
  mobileOpen: boolean;
  onClose: () => void;
  /** make the drawer unreachable while a modal (the inspector) is open */
  inert?: boolean;
}

/**
 * Editorial sidebar (ui-standards §2.1 / §2.3), recolored to the APMG signal
 * accent. Implements all five required slots: brand, state pill, nav (in
 * ScrollArea), theme toggle (bottom of ScrollArea), user card / sign-out.
 */
export function Sidebar({ activeTab, onNavigate, mobileOpen, onClose, inert }: SidebarProps) {
  const pings = useTelemetryCount();
  const { can, roleLabel } = useRbac();
  // Live count for the Pipeline badge — reflects the real public.leads total
  // (polls + refreshes on focus), so the badge is never a stale placeholder.
  const { state: leadStats } = useLeadStats({ pollMs: 15000 });
  const pipelineBadge = leadStats.status === "ready" ? formatInt(leadStats.data.total) : undefined;
  const ref = useRef<HTMLElement>(null);
  // Trap focus inside the drawer while it's open as a mobile overlay.
  useFocusTrap(mobileOpen, ref);

  return (
    <aside
      ref={ref}
      id="apmg-sidebar-nav"
      role="navigation"
      aria-label="APMG navigation"
      tabIndex={-1}
      inert={inert || undefined}
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-dvh w-[220px] shrink-0 flex-col border-r border-border bg-card px-5 pb-4 pt-7 outline-none transition-transform duration-300 ease-out md:static md:z-auto md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      {/* 1 — Brand row */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Radar className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-semibold tracking-tight text-foreground">
            APMG
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Lead generation
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2 — State pill */}
      <div className="mt-5 flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
        <SignalLed />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Pipeline armed
        </span>
      </div>

      {/* 3/4 — Nav + theme toggle, inside the ScrollArea */}
      <ScrollArea className="mt-5 flex min-h-0 flex-1 flex-col pr-2">
        <nav className="flex flex-col gap-5">
          {NAV.map((section) => {
            const items = section.items.filter((item) => can(item.perm));
            if (items.length === 0) return null;
            return (
            <div key={section.caption}>
              <div className="px-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {section.caption}
              </div>
              <div className="mt-1.5 flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = item.id === activeTab;
                  const Icon = item.icon;
                  const badge =
                    item.id === "telemetry"
                      ? pings.toLocaleString("en-US")
                      : item.id === "pipeline"
                        ? pipelineBadge
                        : item.badge;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-track="nav_click"
                      data-track-tab={item.id}
                      onClick={() => onNavigate(item.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors",
                        active
                          ? "bg-accent/60 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-primary"
                        />
                      )}
                      <Icon
                        className={cn(
                          "h-[15px] w-[15px] shrink-0",
                          active
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {badge && (
                        <span
                          className={cn(
                            "tnum rounded-full px-1.5 py-px text-[10px] font-semibold",
                            active
                              ? "bg-primary/15 text-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>

        {/* dev role preview + theme toggle, reachable on short viewports (§2.3 slot 4) */}
        <div className="mt-auto flex flex-col gap-2 pt-5">
          <RoleSwitcher />
          <ThemeToggle />
        </div>
      </ScrollArea>

      {/* 5 — User card / sign-out */}
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-background/40 px-2.5 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-solid text-[11px] font-semibold text-primary-foreground">
            KR
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-foreground">Kane Reroma</span>
              <span className="shrink-0 rounded border border-border px-1 py-px font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {roleLabel}
              </span>
            </div>
            <div className="mt-px truncate font-mono text-[11px] text-muted-foreground">
              kane@apmgservices.com.au
            </div>
          </div>
          <button
            type="button"
            aria-label="Account options"
            data-track="account_options"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
        <Button
          variant="ghost"
          data-track="sign_out"
          className="mt-2 w-full justify-start gap-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
