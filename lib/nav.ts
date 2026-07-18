import {
  Activity,
  BookOpen,
  Filter,
  Handshake,
  HardHat,
  Inbox,
  LayoutDashboard,
  PhoneCall,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { type Permission } from "@/lib/rbac/permissions";

export type TabId =
  | "services"
  | "overview"
  | "pipeline"
  | "leads"
  | "enquiries"
  | "sales"
  | "closed"
  | "integrations"
  | "playbooks"
  | "composer"
  | "legal"
  | "telemetry"
  | "settings";

export interface NavItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
  badge?: string;
  /** permission required to see/enter this surface */
  perm: Permission;
}

export interface NavSection {
  caption: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    caption: "Portal",
    items: [
      { id: "services", label: "Our Services", icon: HardHat, perm: "services.view" },
    ],
  },
  {
    caption: "Monitor",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, perm: "overview.view" },
      { id: "pipeline", label: "Pipeline", icon: Filter, perm: "pipeline.view" },
      { id: "leads", label: "Leads", icon: Users, perm: "leads.view" },
      { id: "enquiries", label: "Enquiries", icon: Inbox, perm: "enquiries.view" },
      { id: "telemetry", label: "Telemetry", icon: Activity, perm: "telemetry.view" },
    ],
  },
  {
    caption: "Sell",
    items: [
      { id: "sales", label: "Sales", icon: PhoneCall, badge: "24", perm: "sales.view" },
      { id: "closed", label: "Closed deals", icon: Handshake, perm: "sales.view" },
    ],
  },
  {
    caption: "Automate",
    items: [
      { id: "integrations", label: "Integrations", icon: Workflow, perm: "integrations.view" },
      { id: "playbooks", label: "Sector Playbooks", icon: BookOpen, perm: "playbooks.view" },
      { id: "composer", label: "Email Composer", icon: Sparkles, perm: "composer.view" },
    ],
  },
  {
    caption: "System",
    items: [
      { id: "legal", label: "Legal Documents", icon: ScrollText, perm: "legal.view" },
      { id: "settings", label: "Settings", icon: Settings, perm: "settings.view" },
    ],
  },
];

/** Permission gating each tab (derived from NAV). */
export const TAB_PERMISSION: Record<TabId, Permission> = Object.fromEntries(
  NAV.flatMap((section) => section.items.map((item) => [item.id, item.perm])),
) as Record<TabId, Permission>;

/** First tab (in nav order) the given checker is allowed to open. */
export function firstAllowedTab(can: (perm: Permission) => boolean): TabId {
  for (const section of NAV) {
    for (const item of section.items) {
      if (can(item.perm)) return item.id;
    }
  }
  return "overview";
}

export const TAB_LABEL: Record<TabId, string> = {
  services: "Our Services",
  overview: "Overview",
  pipeline: "Pipeline",
  leads: "Leads",
  enquiries: "Enquiries",
  sales: "Sales",
  closed: "Closed deals",
  integrations: "Integrations",
  playbooks: "Sector Playbooks",
  composer: "Email Composer",
  legal: "Legal Documents",
  telemetry: "Telemetry",
  settings: "Settings",
};
