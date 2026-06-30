import { DashboardShell } from "@/components/apmg/DashboardShell";
import { RbacProvider } from "@/lib/rbac/RbacProvider";
import { SalesProvider } from "@/components/apmg/SalesProvider";

export default function Page() {
  // initialRole comes from the session once Supabase auth is wired; defaults
  // to admin for the internal console until then.
  return (
    <RbacProvider>
      <SalesProvider>
        <DashboardShell />
      </SalesProvider>
    </RbacProvider>
  );
}
