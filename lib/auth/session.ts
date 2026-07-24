import { type AppUser } from "./users";

/**
 * Client-side session cookies (temporary until Supabase auth lands):
 *  - `apmg-role` — already read by lib/rbac/server.ts to guard API routes.
 *  - `apmg-user` — email, resolved back to a user via findUser() on the server.
 * 30-day lifetime; sign-out expires both.
 */
const MAX_AGE = 60 * 60 * 24 * 30;

export const USER_COOKIE = "apmg-user";
export const ROLE_COOKIE = "apmg-role";

export function setSessionCookies(user: AppUser): void {
  document.cookie = `${ROLE_COOKIE}=${user.role}; path=/; max-age=${MAX_AGE}; samesite=lax`;
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(user.email)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

export function clearSessionCookies(): void {
  document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${USER_COOKIE}=; path=/; max-age=0`;
}
