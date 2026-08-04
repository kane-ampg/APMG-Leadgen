import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listUsers = vi.fn();
const setUserRole = vi.fn();
const requirePermission = vi.fn();

vi.mock("@/lib/auth/userStore", () => ({
  listUsers: (...a: unknown[]) => listUsers(...a),
  setUserRole: (...a: unknown[]) => setUserRole(...a),
}));

vi.mock("@/lib/rbac/server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    requirePermission: (...a: unknown[]) => requirePermission(...a),
  };
});

import { MAIN_ADMIN_EMAIL } from "@/lib/auth/policy";
import { PATCH } from "./route";

const ACTOR = "boss@apmgservices.com.au";

/** A PATCH request the sameOrigin floor will accept (no Origin header). */
function patch(body: unknown): Request {
  return new Request("http://local/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function row(email: string, role: string) {
  return { email, name: null, picture_url: null, role, created_at: "", last_login_at: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ ok: true, role: "admin", email: ACTOR });
  setUserRole.mockResolvedValue("ok");
});

describe("PATCH /api/admin/users — authorization", () => {
  it("refuses a caller without users.manage", async () => {
    requirePermission.mockResolvedValue({ ok: false, status: 403, error: "nope" });
    const res = await PATCH(patch({ email: "x@apmgservices.com.au", role: "sales" }));
    expect(res.status).toBe(403);
    expect(setUserRole).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users — lockout protections", () => {
  it("refuses to demote the main admin", async () => {
    listUsers.mockResolvedValue([row(MAIN_ADMIN_EMAIL, "admin"), row(ACTOR, "admin")]);
    const res = await PATCH(patch({ email: MAIN_ADMIN_EMAIL, role: "sales" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "main-admin" });
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it("refuses to change your own role", async () => {
    listUsers.mockResolvedValue([row(MAIN_ADMIN_EMAIL, "admin"), row(ACTOR, "admin")]);
    const res = await PATCH(patch({ email: ACTOR, role: "sales" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "self" });
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it("refuses to demote the last remaining admin", async () => {
    const solo = "solo@apmgservices.com.au";
    listUsers.mockResolvedValue([row(solo, "admin")]);
    requirePermission.mockResolvedValue({ ok: true, role: "admin", email: "other@apmgservices.com.au" });
    const res = await PATCH(patch({ email: solo, role: "sales" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "last-admin" });
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it("allows a normal change and lowercases the email", async () => {
    listUsers.mockResolvedValue([
      row(MAIN_ADMIN_EMAIL, "admin"),
      row(ACTOR, "admin"),
      row("nicole@apmgservices.com.au", "pending"),
    ]);
    const res = await PATCH(patch({ email: "Nicole@APMGServices.com.au", role: "sales" }));
    expect(res.status).toBe(200);
    expect(setUserRole).toHaveBeenCalledWith("nicole@apmgservices.com.au", "sales");
  });
});

describe("PATCH /api/admin/users — validation", () => {
  beforeEach(() => {
    listUsers.mockResolvedValue([
      row(MAIN_ADMIN_EMAIL, "admin"),
      row(ACTOR, "admin"),
      row("nicole@apmgservices.com.au", "pending"),
    ]);
  });

  it("rejects a role outside the catalog", async () => {
    const res = await PATCH(patch({ email: "nicole@apmgservices.com.au", role: "superuser" }));
    expect(res.status).toBe(400);
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it("rejects a role that is an inherited object property", async () => {
    // isRole must be an own-property check; "constructor" must not pass.
    const res = await PATCH(patch({ email: "nicole@apmgservices.com.au", role: "constructor" }));
    expect(res.status).toBe(400);
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-string email", async () => {
    expect((await PATCH(patch({ role: "sales" }))).status).toBe(400);
    expect((await PATCH(patch({ email: 42, role: "sales" }))).status).toBe(400);
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it("404s an address that is not a known user", async () => {
    const res = await PATCH(patch({ email: "ghost@apmgservices.com.au", role: "sales" }));
    expect(res.status).toBe(404);
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body", async () => {
    const req = new Request("http://local/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect((await PATCH(req)).status).toBe(400);
  });
});

describe("PATCH /api/admin/users — store outcomes", () => {
  beforeEach(() => {
    listUsers.mockResolvedValue([
      row(MAIN_ADMIN_EMAIL, "admin"),
      row(ACTOR, "admin"),
      row("nicole@apmgservices.com.au", "pending"),
    ]);
  });

  it("reports a row that vanished between read and write", async () => {
    setUserRole.mockResolvedValue("missing");
    const res = await PATCH(patch({ email: "nicole@apmgservices.com.au", role: "sales" }));
    expect(res.status).toBe(404);
  });

  it("reports a store error", async () => {
    setUserRole.mockResolvedValue("error");
    const res = await PATCH(patch({ email: "nicole@apmgservices.com.au", role: "sales" }));
    expect(res.status).toBe(500);
  });

  it("reports demo mode rather than pretending to persist", async () => {
    setUserRole.mockResolvedValue("demo");
    const res = await PATCH(patch({ email: "nicole@apmgservices.com.au", role: "sales" }));
    expect(res.status).toBe(503);
  });
});
