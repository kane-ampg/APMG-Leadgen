import { cookies } from "next/headers";
import { DashboardShell } from "@/components/apmg/DashboardShell";
import { RbacProvider } from "@/lib/rbac/RbacProvider";
import { SalesProvider } from "@/components/apmg/SalesProvider";
import { findUser } from "@/lib/auth/users";
import { USER_COOKIE } from "@/lib/auth/session";

export default async function Page() {
  // A signed-in test user (via /login) fixes the role — the sales reps can
  // only ever see the Sales experience. With no session the internal console
  // keeps its admin default (with the dev role preview) until Supabase lands.
  const store = await cookies();
  const raw = store.get(USER_COOKIE)?.value;
  const user = findUser(raw ? decodeURIComponent(raw) : null);

  return (
    <RbacProvider initialRole={user?.role} locked={!!user}>
      <SalesProvider>
        <DashboardShell user={user ?? undefined} />
      </SalesProvider>
    </RbacProvider>
  );
}
