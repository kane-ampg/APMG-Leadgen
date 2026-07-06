"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronsLeft, LogOut, MoreHorizontal, X } from "lucide-react";
import brandLogo from "@/app/icon.png";
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

  // Desktop-only "retract" to an icon rail. Persisted so it survives reloads.
  // Hydrated after mount to avoid an SSR/client mismatch (starts expanded).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem("apmg:sidebar-collapsed") === "1");
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("apmg:sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      ref={ref}
      id="apmg-sidebar-nav"
      role="navigation"
      aria-label="APMG navigation"
      data-collapsed={collapsed || undefined}
      tabIndex={-1}
      inert={inert || undefined}
      className={cn(
        // Padding stays px-5 in BOTH states so nothing shifts horizontally on
        // retract — a ~32px mark under px-5 lands centred in the 76px rail, so
        // icons appear to stay put while the rail width glides in around them.
        // Per-property timing: width retracts slowly+smoothly (500ms, canonical
        // ease §14.1); the mobile drawer keeps its own 300ms slide (§14.2).
        // md:relative + md:z-30 (not md:static/md:z-auto): the retract handle
        // overhangs the right border via -right-3, so the sidebar must own a
        // positioned stacking context above <main> or the handle is painted over.
        "fixed inset-y-0 left-0 z-50 flex h-dvh shrink-0 flex-col border-r border-border bg-card px-5 pb-4 pt-7 outline-none [transition:width_500ms_cubic-bezier(0.16,1,0.3,1),transform_300ms_ease-out] md:relative md:z-30 md:translate-x-0",
        // width: full drawer on mobile; retractable icon rail on desktop
        collapsed ? "w-[248px] md:w-[76px]" : "w-[248px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      {/* retract / expand handle — desktop only */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand" : "Collapse"}
        className="absolute -right-3 top-8 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:flex"
      >
        <ChevronsLeft
          className={cn(
            "h-3.5 w-3.5 [transition:transform_500ms_cubic-bezier(0.16,1,0.3,1)]",
            collapsed && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* 1 — Brand row */}
      <div className="flex items-center gap-2.5">
        {/* Brand mark — APMG wordmark (white artwork) on the AA-safe solid red
            so it reads in both themes (§17.8). object-contain keeps its 240×184
            ratio inside the square tile. */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-solid">
          <Image src={brandLogo} alt="APMG" width={24} height={18} priority className="object-contain" />
        </div>
        <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
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
          className={cn(
            "-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden",
            collapsed && "hidden",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2 — State pill */}
      <div className="mt-5 flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
        <SignalLed />
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
            collapsed && "md:hidden",
          )}
        >
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
              <div
                className={cn(
                  "px-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground",
                  collapsed && "md:hidden",
                )}
              >
                {section.caption}
              </div>
              <div className={cn("mt-1.5 flex flex-col gap-0.5", collapsed && "md:mt-0")}>
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
                      // collapsed hides the label (display:none), so give the
                      // icon-only button an explicit name for AT (§16)
                      aria-label={collapsed ? item.label : undefined}
                      title={collapsed ? item.label : undefined}
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
                      <span className={cn("flex-1 truncate text-left", collapsed && "md:hidden")}>
                        {item.label}
                      </span>
                      {badge && (
                        <span
                          className={cn(
                            "tnum rounded-full px-1.5 py-px text-[10px] font-semibold",
                            collapsed && "md:hidden",
                            active
                              ? "bg-primary/15 text-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {badge}
                        </span>
                      )}
                      {/* collapsed rail: surface the badge as a corner dot so counts
                          aren't silently lost when labels hide */}
                      {badge && collapsed && (
                        <span
                          aria-hidden
                          className="absolute right-1.5 top-1.5 hidden h-1.5 w-1.5 rounded-full bg-primary md:block"
                        />
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
          <div className={cn(collapsed && "md:hidden")}>
            <RoleSwitcher />
          </div>
          <ThemeToggle compact={collapsed} />
        </div>
      </ScrollArea>

      {/* 5 — User card / sign-out */}
      <div className={cn("mt-4 border-t border-border pt-4", collapsed && "md:mt-3 md:pt-3")}>
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-md border border-border bg-background/40 px-2.5 py-2",
            // collapsed: the 28px avatar + px-2.5 won't fit the 76px rail, so
            // centre it and drop the side padding (chip stays bordered)
            collapsed && "md:justify-center md:px-0",
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-solid text-[11px] font-semibold text-primary-foreground">
            KR
          </div>
          <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
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
            className={cn(
              "rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "md:hidden",
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
        <Button
          variant="ghost"
          data-track="sign_out"
          aria-label={collapsed ? "Sign out" : undefined}
          title={collapsed ? "Sign out" : undefined}
          className="mt-2 w-full justify-start gap-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className={cn(collapsed && "md:hidden")}>Sign out</span>
        </Button>
      </div>
    </aside>
  );
}
