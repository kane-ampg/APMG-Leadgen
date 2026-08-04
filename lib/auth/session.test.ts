import { beforeAll, describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-value-at-least-32-bytes-long!!";
});

describe("session cookie", () => {
  it("round-trips the claims it was given", async () => {
    const token = await signSession({
      email: "simon@apmgservices.com.au",
      name: "Simon",
      viewAs: null,
    });
    const claims = await verifySession(token);
    expect(claims?.email).toBe("simon@apmgservices.com.au");
    expect(claims?.name).toBe("Simon");
    expect(claims?.viewAs).toBeNull();
  });

  it("preserves a valid viewAs role", async () => {
    const token = await signSession({ email: "kane@apmgservices.com.au", viewAs: "sales" });
    expect((await verifySession(token))?.viewAs).toBe("sales");
  });

  it("drops a viewAs value that is not a real role", async () => {
    const token = await signSession({
      email: "kane@apmgservices.com.au",
      // @ts-expect-error deliberately invalid, simulating a tampered payload
      viewAs: "superuser",
    });
    expect((await verifySession(token))?.viewAs).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signSession({ email: "simon@apmgservices.com.au" });
    const tampered = `${token.slice(0, -4)}AAAA`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ email: "simon@apmgservices.com.au" });
    process.env.AUTH_SECRET = "a-completely-different-secret-value-32b!!";
    const result = await verifySession(token);
    process.env.AUTH_SECRET = "test-secret-value-at-least-32-bytes-long!!";
    expect(result).toBeNull();
  });

  it("rejects undefined and garbage", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not-a-jwt")).toBeNull();
  });
});
