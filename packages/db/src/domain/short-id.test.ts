import { describe, expect, it } from "vitest";
import { formatShortId, isShortId, isValidPrefix, nextShortId, normalizeShortId } from "./short-id";

describe("card short id (spec §3.1)", () => {
  it("formats <prefix>-<n>", () => {
    expect(formatShortId("OC", 123)).toBe("OC-123");
    expect(formatShortId("AGB", 1)).toBe("AGB-1");
  });

  it("accepts 2–4 uppercase alphanumeric prefixes", () => {
    expect(isValidPrefix("OC")).toBe(true);
    expect(isValidPrefix("AGB")).toBe(true);
    expect(isValidPrefix("AB12")).toBe(true);
    expect(isValidPrefix("a")).toBe(false);
    expect(isValidPrefix("oc")).toBe(false);
    expect(isValidPrefix("AGENT")).toBe(false);
    expect(isValidPrefix("O-C")).toBe(false);
  });

  it("allocates the next number from the project counter", () => {
    expect(nextShortId("AGB", 1)).toEqual({ shortId: "AGB-1", nextNumber: 2 });
    expect(nextShortId("OC", 42)).toEqual({ shortId: "OC-42", nextNumber: 43 });
  });

  it("recognizes parent and dotted child short ids case-insensitively", () => {
    expect(isShortId("AGB-5")).toBe(true);
    expect(isShortId("ovk-5.4")).toBe(true);
    expect(isShortId("OC-1.2.3")).toBe(true);
    expect(isShortId("not-an-id")).toBe(false);
    expect(normalizeShortId("  ovk-5.4 ")).toBe("OVK-5.4");
  });
});
