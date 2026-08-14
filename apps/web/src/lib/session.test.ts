import { afterEach, describe, expect, it } from "vitest";
import { readSessionToken, signSession } from "./session";

const SECRET = "test-secret-at-least-32-characters-long";

describe("session token", () => {
  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it("round-trips user id and email", async () => {
    process.env.AUTH_SECRET = SECRET;
    const token = await signSession({
      userId: "user-1",
      email: "admin@local",
    });
    const session = await readSessionToken(token);
    expect(session).toEqual({ userId: "user-1", email: "admin@local" });
  });

  it("rejects a tampered token", async () => {
    process.env.AUTH_SECRET = SECRET;
    const token = await signSession({ userId: "user-1", email: "a@b.c" });
    const session = await readSessionToken(`${token}x`);
    expect(session).toBeNull();
  });
});
