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
 * In dev only, a persisted override lets you preview other roles.
 */
export function RbacProvider({
  initialRole = DEFAULT_ROLE,
  children,
}: {
  initialRole?: Role;
  children: ReactNode;
}) {
  const [role, setRoleState] = useState<Role>(initialRole);

  useEffect(() => {
    if (!DEV) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isRole(saved) && ROLES[saved].enabled) setRoleState(saved);
    } catch {
      /* storage unavailable — keep initialRole */
    }
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    if (DEV) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = useMemo<RbacValue>(
    () => ({
      role,
      roleLabel: ROLES[role].label,
      can: (perm: Permission) => roleCan(role, perm),
      setRole,
      devMode: DEV,
    }),
    [role, setRole],
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
