import { type Role } from "@/lib/rbac/roles";

/**
 * Temporary credential directory for the internal team. Each user's role is
 * pinned here, so signing in through /login can only ever grant the role on
 * their row — the sales reps can never reach the admin console.
 * REPLACE with Supabase auth before production: a shared plaintext password
 * is a stand-in, not a security boundary.
 */
export interface AppUser {
  email: string;
  name: string;
  initials: string;
  role: Role;
  /** extra addresses that sign in as this user (e.g. the .com / .com.au pair) */
  aliases?: readonly string[];
}

const SHARED_PASSWORD = "apmgservices";

export const TEST_USERS: readonly AppUser[] = [
  {
    email: "kane@apmgservices.com.au",
    name: "Kane Reroma",
    initials: "KR",
    role: "admin",
    aliases: ["kane@apmgservices.com"],
  },
  { email: "simon@apmgservices.com.au", name: "Simon", initials: "S", role: "sales" },
  { email: "nicole@apmgservices.com.au", name: "Nicole", initials: "N", role: "sales" },
  { email: "zac@apmgservices.com.au", name: "Zac", initials: "Z", role: "sales" },
  { email: "farbod@apmgservices.com.au", name: "Farbod", initials: "F", role: "sales" },
];

export function findUser(email: string | null | undefined): AppUser | null {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  return TEST_USERS.find((u) => u.email === needle || u.aliases?.includes(needle)) ?? null;
}

export function authenticate(email: string, password: string): AppUser | null {
  const user = findUser(email);
  return user && password === SHARED_PASSWORD ? user : null;
}
