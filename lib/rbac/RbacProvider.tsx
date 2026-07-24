"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type Permission } from "./permissions";
import { DEFAULT_ROLE, isRole, ROLES, roleCan, type Role } from "./roles";

const STORAGE_KEY = "apmg-role";
const DEV = process.env.NODE_ENV !== "production";

interface RbacValue {
  role: Role;
  roleLabel: string;
  can: (perm: Permission) => boolean;
  /** dev-only role preview; in production the role comes from the session */
  setRole: (role: Role) => void;
  devMode: boolean;
}

const RbacContext = createContext<RbacValue | null>(null);

/**
 * Provides the current user's role + permission checks. `initialRole` is the
 * server-resolved session role (defaults to admin until Supabase auth lands).
 * In dev only, a persisted override lets you preview other roles — unless
 * `locked` (a real signed-in session): then the session role is final and the
 * role preview is disabled, so a sales rep can never see the admin console.
 */
export function RbacProvider({
  initialRole = DEFAULT_ROLE,
  locked = false,
  children,
}: {
  initialRole?: Role;
  locked?: boolean;
  children: ReactNode;
}) {
  const [role, setRoleState] = useState<Role>(initialRole);

  useEffect(() => {
    if (!DEV || locked) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isRole(saved) && ROLES[saved].enabled) setRoleState(saved);
    } catch {
      /* storage unavailable — keep initialRole */
    }
  }, [locked]);

  const setRole = useCallback(
    (next: Role) => {
      if (locked) return;
      setRoleState(next);
      if (DEV) {
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
      }
    },
    [locked],
  );

  const value = useMemo<RbacValue>(
    () => ({
      role,
      roleLabel: ROLES[role].label,
      can: (perm: Permission) => roleCan(role, perm),
      setRole,
      devMode: DEV && !locked,
    }),
    [role, setRole, locked],
  );

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac(): RbacValue {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error("useRbac must be used within <RbacProvider>");
  return ctx;
}

export function useCan(perm: Permission): boolean {
  return useRbac().can(perm);
}
