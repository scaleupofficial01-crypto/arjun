import { describe, it, expect } from "vitest";
import { isSameOrigin, rateLimit } from "../src/lib/security";

function req(method: string, headers: Record<string, string>): Request {
  return new Request("https://empire.test/api/x", { method, headers });
}

describe("isSameOrigin (CSRF/origin checks)", () => {
  it("allows GET regardless of origin", () => {
    expect(isSameOrigin(req("GET", { origin: "https://evil.example" }))).toBe(true);
  });
  it("allows POST with matching origin host", () => {
    expect(
      isSameOrigin(req("POST", { origin: "https://empire.test", host: "empire.test" })),
    ).toBe(true);
  });
  it("blocks POST with mismatched origin host", () => {
    expect(
      isSameOrigin(req("POST", { origin: "https://evil.example", host: "empire.test" })),
    ).toBe(false);
  });
  it("allows POST without origin when Sec-Fetch-Site is same-origin", () => {
    expect(
      isSameOrigin(req("POST", { host: "empire.test", "sec-fetch-site": "same-origin" })),
    ).toBe(true);
  });
  it("blocks POST without origin when Sec-Fetch-Site is cross-site", () => {
    expect(
      isSameOrigin(req("POST", { host: "empire.test", "sec-fetch-site": "cross-site" })),
    ).toBe(false);
  });
  it("honours x-forwarded-host behind a proxy", () => {
    expect(
      isSameOrigin(
        req("POST", {
          origin: "https://app.empire.test",
          host: "internal:3000",
          "x-forwarded-host": "app.empire.test",
        }),
      ),
    ).toBe(true);
  });
});

describe("rateLimit (in-memory fallback)", () => {
  it("allows up to the limit then blocks", async () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const r = await rateLimit(key, 3, 60);
      expect(r.ok).toBe(true);
    }
    const blocked = await rateLimit(key, 3, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
