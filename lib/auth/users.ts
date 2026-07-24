import { type Role } from "@/lib/rbac/roles";

/**
 * Temporary credential directory for the two Sales test users. Their role is
 * fixed to `sales` — signing in through /login can never yield admin access.
 * REPLACE with Supabase auth before production: a shared plaintext password
 * is a stand-in, not a security boundary.
 */
export interface AppUser {
  email: string;
  name: string;
  initials: string;
  role: Role;
}

const SHARED_PASSWORD = "apmgservices";

export const TEST_USERS: readonly AppUser[] = [
  { email: "simon@apmgservices.com.au", name: "Simon", initials: "S", role: "sales" },
  { email: "nicole@apmgservices.com.au", name: "Nicole", initials: "N", role: "sales" },
];

export function findUser(email: string | null | undefined): AppUser | null {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  return TEST_USERS.find((u) => u.email === needle) ?? null;
}

export function authenticate(email: string, password: string): AppUser | null {
  const user = findUser(email);
  return user && password === SHARED_PASSWORD ? user : null;
}
