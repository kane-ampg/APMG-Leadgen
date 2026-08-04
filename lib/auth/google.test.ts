import { describe, expect, it } from "vitest";
import { pkceChallenge, randomToken } from "./google";

/**
 * Only the pure, input->output helpers are covered here. Everything else in
 * google.ts either talks to the network (exchangeCode, verifyIdToken) or
 * reads process.env for secrets (clientId, clientSecret, authorizeUrl) — this
 * file deliberately does not mock Google or build an HTTP harness for those.
 */

describe("randomToken", () => {
  it("returns a base64url string (no +, /, = or padding)", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encodes 32 random bytes to the expected unpadded length", () => {
    // 32 bytes = 256 bits; base64url without padding is ceil(256 / 6) = 43 chars.
    expect(randomToken()).toHaveLength(43);
  });

  it("is not the same value on successive calls", () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("pkceChallenge", () => {
  // RFC 7636 Appendix B ("Example for the S256 code_challenge_method") gives
  // this exact code_verifier / code_challenge pair as the spec's own worked
  // example — used here as ground truth instead of re-deriving the SHA-256
  // digest by hand. Independently re-verified against Node's `crypto` module
  // outside this test file before committing to it.
  it("matches the RFC 7636 Appendix B worked example", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    await expect(pkceChallenge(verifier)).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("returns a base64url string of the length a SHA-256 digest produces", async () => {
    const challenge = await pkceChallenge(randomToken());
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    // SHA-256 is always 32 bytes -> 43 unpadded base64url characters, same as
    // randomToken's own 32-byte input.
    expect(challenge).toHaveLength(43);
  });

  it("is deterministic for the same verifier", async () => {
    const verifier = randomToken();
    expect(await pkceChallenge(verifier)).toBe(await pkceChallenge(verifier));
  });
});
