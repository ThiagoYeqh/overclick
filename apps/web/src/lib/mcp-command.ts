export type McpClient = "claude" | "codex" | "gemini" | "generic";

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildMcpConnectCommand(input: {
  client: McpClient;
  baseUrl: string;
  token: string;
}): string {
  const header = `--header "Authorization: Bearer ${input.token}"`;

  switch (input.client) {
    case "claude":
      return [
        "claude mcp add --transport http overclick \\",
        `  ${input.baseUrl} \\`,
        `  ${header}`,
      ].join("\n");
    case "codex":
      return [
        `export OVERCLICK_MCP_BEARER_TOKEN=${shellSingleQuote(input.token)}`,
        `codex mcp add overclick --url ${input.baseUrl} \\`,
        "  --bearer-token-env-var OVERCLICK_MCP_BEARER_TOKEN",
      ].join("\n");
    case "gemini":
      return [
        `gemini mcp add --transport http overclick ${input.baseUrl} \\`,
        `  ${header}`,
      ].join("\n");
    case "generic":
      return [
        "# generic MCP over HTTP",
        `# url:    ${input.baseUrl}`,
        `# header: Authorization: Bearer ${input.token}`,
      ].join("\n");
  }
}

export function mcpClientFromExecutorId(id: string): McpClient {
  switch (id) {
    case "claude-code":
      return "claude";
    case "codex":
      return "codex";
    case "gemini-cli":
      return "gemini";
    default:
      return "generic";
  }
}
