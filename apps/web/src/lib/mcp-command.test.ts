import { describe, expect, it } from "vitest";
import { buildMcpConnectCommand } from "./mcp-command";

describe("buildMcpConnectCommand", () => {
  it("uses Codex's bearer-token env var flow instead of inline headers", () => {
    const command = buildMcpConnectCommand({
      client: "codex",
      baseUrl: "http://localhost:3000/mcp",
      token: "ocb_live_secret",
    });

    expect(command).toBe(
      [
        "export OVERCLICK_MCP_BEARER_TOKEN='ocb_live_secret'",
        "codex mcp add overclick --url http://localhost:3000/mcp \\",
        "  --bearer-token-env-var OVERCLICK_MCP_BEARER_TOKEN",
      ].join("\n"),
    );
    expect(command).not.toContain("--transport http");
    expect(command).not.toContain("--header");
  });

  it("keeps header-based commands for clients that support custom headers", () => {
    expect(
      buildMcpConnectCommand({
        client: "claude",
        baseUrl: "http://localhost:3000/mcp",
        token: "ocb_live_secret",
      }),
    ).toBe(
      [
        "claude mcp add --transport http overclick \\",
        "  http://localhost:3000/mcp \\",
        '  --header "Authorization: Bearer ocb_live_secret"',
      ].join("\n"),
    );

    expect(
      buildMcpConnectCommand({
        client: "generic",
        baseUrl: "http://localhost:3000/mcp",
        token: "ocb_live_secret",
      }),
    ).toBe(
      [
        "# generic MCP over HTTP",
        "# url:    http://localhost:3000/mcp",
        "# header: Authorization: Bearer ocb_live_secret",
      ].join("\n"),
    );
  });
});
