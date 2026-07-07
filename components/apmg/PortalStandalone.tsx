"use client";

import { useClickTelemetry } from "@/lib/telemetry";
import { ServicesPortal } from "./ServicesPortal";

/**
 * Client shell for the public /portal route — where tracked outreach links
 * (/t/<leadId>) land after the attribution redirect. No sidebar, no RBAC:
 * this is the customer-facing surface, so it only mounts the delegated
 * click-telemetry listener (view "portal", the same listener DashboardShell
 * runs for internal tabs) and the shared ServicesPortal.
 *
 * The root layout leaves <body> unconstrained, so this shell owns the
 * viewport (`h-dvh`) and scrolls internally — the document itself never
 * scrolls, matching the app's shell rule (ui-standards §1.1). The background
 * and text tokens are restated explicitly so the page reads correctly even
 * though <body> already carries them via globals.css.
 */
export function PortalStandalone() {
  useClickTelemetry("portal");

  return (
    <div className="h-dvh max-h-dvh overflow-y-auto overflow-x-hidden bg-background text-foreground">
      {/* `standalone` marks this as the CUSTOMER host: only here do the
          portal_view / portal_service_open contract events fire (the internal
          Our Services tab must not pollute the Enquiries funnel). */}
      <ServicesPortal standalone />
    </div>
  );
}
