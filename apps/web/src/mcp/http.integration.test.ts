import { afterEach, describe, expect, it } from "vitest";
import { handleMcpRequest } from "./http";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";

function initializeBody() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "overclick-test", version: "0.0.0" },
    },
  };
}

describe("HTTP /mcp auth", () => {
  let world: TestWorld;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
  });

  it("returns 401 when the bearer token was revoked", async () => {
    world = await createTestWorld();
    const response = await handleMcpRequest(
      new Request("http://board.local/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${world.revokedSecret}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initializeBody()),
      }),
      { db: world.db },
    );
    expect(response.status).toBe(401);
    const json = (await response.json()) as { error: { code: string } };
    expect(json.error.code).toBe("TOKEN_REVOKED");
  });

  it("returns 401 when the token is missing", async () => {
    world = await createTestWorld();
    const response = await handleMcpRequest(
      new Request("http://board.local/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initializeBody()),
      }),
      { db: world.db },
    );
    expect(response.status).toBe(401);
  });

  it("initializes over streamable HTTP with a live token", async () => {
    world = await createTestWorld();
    const response = await handleMcpRequest(
      new Request("http://board.local/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${world.secret}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initializeBody()),
      }),
      { db: world.db },
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      result?: { serverInfo?: { name: string } };
    };
    expect(json.result?.serverInfo?.name).toBe("overclick");
  });
});
