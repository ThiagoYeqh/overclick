# Official OverClick plugin design

Status: approved for OCL-50. This document records the capability matrix explored
in OCL-49 and the owner's final decisions. It replaces the discarded OCL-47 design.

## Package shape

`plugin/` is the single portable package. `plugin/OVERCLICK.md` is the only full
workflow source; the bundled skill points to it instead of maintaining a second copy.
Provider manifests adapt that same package to each native loader.

| Capability | Claude Code | Grok CLI | Kimi Code | Codex |
| --- | --- | --- | --- | --- |
| Manifest | `.claude-plugin/plugin.json` | `plugin.json` | `kimi.plugin.json` | `.codex-plugin/plugin.json` |
| Repository marketplace | `.claude-plugin/marketplace.json` | `.grok-plugin/marketplace.json` | Native custom install | Installer-created local marketplace |
| Skill | `skills/overclick/SKILL.md` | Same | Same | Same |
| Commands | Auto-discovered `commands/` | Auto-discovered `commands/` | `commands` manifest field | Skill-driven; not declared in the manifest |
| MCP | `.mcp.json` plus native user config | `.mcp.json` plus native user config | `mcpServers` plus private user config | `mcpServers` manifest field plus `[mcp_servers]` user config |
| Hooks | `hooks/hooks.json` | `hooks/hooks.json` | `hooks` manifest field | Global user hook file; deliberately absent from the plugin manifest |

The Codex manifest contains only the skill and MCP contributions. Its installer
uses the native marketplace manager, then writes the required user MCP block and
merges global hooks without replacing unrelated rules.

## Hook policy

Four lifecycle hooks ship as POSIX shell scripts:

1. `SessionStart` fetches the first page of open work and claims owned by the
   current MCP token. It contributes only card IDs, titles, and statuses. Default: on.
2. `PostToolUse` after `task_deliver` requires a full Git commit ID in evidence,
   refreshes remote refs without printing them, and confirms that a remote ref contains
   the commit. Default: on.
3. `Stop` queries claims owned by the current token and blocks while any remain in
   execution. Default: off; set `enforce_stop=1` in private plugin config.
4. `PreToolUse` before `task_create` asks the board for the current harness and
   compares it with the card input. Default: off; set `enforce_harness=1`.

Network and Git diagnostics suppress raw remote errors so neither credentials nor
infrastructure addresses enter agent output. Hook failures never print private config.

## Installer decisions

The repository root `install.sh` is also served verbatim by `GET /install.sh`.
It uses a hidden token prompt in interactive mode, detects installed CLIs, and calls
their native plugin managers. The stable package copy and a mode-600 config live in
the user's configuration area. Provider MCP config is updated idempotently; Codex gets
an explicit `[mcp_servers.overclick]` block and merged global hooks.

Claude receives an `@` import inside `<!-- overclick:start -->` and
`<!-- overclick:end -->`. A CLI without native plugin support receives one AGENTS.md
reference line inside the same markers. Re-running the installer replaces the marked
block, never duplicates it. Supported CLIs use their plugin instead of an AGENTS.md
fallback; `OVERCLICK_AGENTS_FALLBACK=1` enables that reference when an additional,
unrecognized CLI also needs it.

The package keeps generic instance and token inputs. It contains no internal routing
menu, organization names, deployment authority, or private endpoint. Live harness
selection always comes from `harness_recommend` on the connected board.

## Verification contract

- Validate all JSON manifests and both provider validators.
- Validate the Codex plugin and the OverClick skill with their official local tools.
- Run the installer twice against an isolated home with stub native managers; markers,
  MCP entries, and hook rules must remain singular and private input must not appear in
  output.
- Exercise all four hooks with fixture MCP responses and a local Git remote.
- Fetch `/install.sh` and compare its response byte-for-byte with the root installer.
- Run the MCP schema, integration, lint, type, and production build checks.
