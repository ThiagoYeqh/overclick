import { describe, expect, it } from "vitest";
import { APP_VERSION, isNewer } from "./updates";

describe("update version comparison", () => {
  it("treats a higher patch, minor or major as newer", () => {
    expect(isNewer("v0.1.2", "0.1.1")).toBe(true);
    expect(isNewer("0.2.0", "0.1.9")).toBe(true);
    expect(isNewer("v1.0.0", "0.9.9")).toBe(true);
  });

  it("treats same or older versions as not newer", () => {
    expect(isNewer("v0.1.1", "0.1.1")).toBe(false);
    expect(isNewer("0.1.0", "0.1.1")).toBe(false);
    expect(isNewer("v0.0.9", "0.1.1")).toBe(false);
  });

  it("rejects garbage tags instead of updating", () => {
    expect(isNewer("latest", "0.1.1")).toBe(false);
    expect(isNewer("", "0.1.1")).toBe(false);
  });

  it("reads the running version from the package manifest", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
