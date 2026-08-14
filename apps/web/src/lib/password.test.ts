import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("local password hash", () => {
  it("verifies the same password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct-horse");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects a malformed stored value without throwing", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});
