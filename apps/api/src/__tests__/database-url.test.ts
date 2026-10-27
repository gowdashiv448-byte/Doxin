import { describe, expect, it } from "vitest";
import { deriveAppDatabaseUrl } from "../lib/database-url.js";

describe("deriveAppDatabaseUrl", () => {
  it("switches the owner credentials to the app role and preserves the target", () => {
    const derived = deriveAppDatabaseUrl(
      "postgresql://doxin:owner-secret@db.internal:5432/doxin?sslmode=require",
      "app@password:with/special?chars",
    );
    const parsed = new URL(derived);

    expect(parsed.protocol).toBe("postgresql:");
    expect(parsed.username).toBe("doxin_app");
    expect(decodeURIComponent(parsed.password)).toBe(
      "app@password:with/special?chars",
    );
    expect(parsed.hostname).toBe("db.internal");
    expect(parsed.port).toBe("5432");
    expect(parsed.pathname).toBe("/doxin");
    expect(parsed.search).toBe("?sslmode=require");
  });

  it("rejects non-Postgres URLs", () => {
    expect(() =>
      deriveAppDatabaseUrl("https://example.com/database", "password123"),
    ).toThrow(/postgres/);
  });
});
