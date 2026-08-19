#!/usr/bin/env bash
set -euo pipefail

umask 077

plugin_source="${OVERCLICK_PLUGIN_SOURCE:-ustoppble/overclick}"
install_home="${OVERCLICK_INSTALL_HOME:-$HOME}"
project_dir="${OVERCLICK_PROJECT_DIR:-$PWD}"

if [[ -n "${OVERCLICK_INSTALL_HOME:-}" ]]; then
  config_root="$install_home/.config"
else
  config_root="${XDG_CONFIG_HOME:-$install_home/.config}"
fi
overclick_root="$config_root/overclick"
plugin_target="$overclick_root/plugin"
private_config="$overclick_root/config"

read_private_setting() {
  local key=$1 line
  [[ -f "$private_config" ]] || return 1
  line=$(grep -E "^${key}=" "$private_config" 2>/dev/null | tail -n 1) || return 1
  printf '%s' "${line#*=}"
}

if [[ -n "${OVERCLICK_INSTANCE_URL:-}" ]]; then
  instance_url=$OVERCLICK_INSTANCE_URL
else
  read -r -p "OverClick instance URL: " instance_url </dev/tty
fi

if [[ -n "${OVERCLICK_TOKEN:-}" ]]; then
  token=$OVERCLICK_TOKEN
else
  read -r -s -p "OverClick token: " token </dev/tty
  printf '\n' >/dev/tty
fi

if [[ -z "$instance_url" || -z "$token" ]]; then
  printf '%s\n' "Instance URL and token are required." >&2
  exit 1
fi
if [[ "$instance_url" == *$'\n'* || "$instance_url" == *$'\r'* || "$token" == *$'\n'* || "$token" == *$'\r'* ]]; then
  printf '%s\n' "Instance URL and token must each fit on one line." >&2
  exit 1
fi
if [[ "$instance_url" != http://* && "$instance_url" != https://* ]]; then
  printf '%s\n' "Instance URL must use HTTP or HTTPS." >&2
  exit 1
fi
if [[ "${instance_url#*://}" == *@* ]]; then
  printf '%s\n' "Instance URL must not contain embedded credentials." >&2
  exit 1
fi

instance_url=${instance_url%/}
if [[ "$instance_url" == */mcp ]]; then
  mcp_url=$instance_url
else
  mcp_url="$instance_url/mcp"
fi

plugin_src="$overclick_root/plugin-src"

script_dir=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)
if [[ -f "$script_dir/plugin/OVERCLICK.md" ]]; then
  source_root=$script_dir
elif [[ -n "${OVERCLICK_PLUGIN_DIR:-}" && -f "$OVERCLICK_PLUGIN_DIR/OVERCLICK.md" ]]; then
  source_root=$(CDPATH='' cd -- "$OVERCLICK_PLUGIN_DIR/.." && pwd)
else
  # A `source github` marketplace entry can register without ever fetching the
  # package (Claude CLI accepts it, marks it enabled, never materializes a
  # cache). A plain git checkout served as a local directory marketplace is
  # what actually works, so this installer keeps that checkout itself and
  # re-running install.sh doubles as the update path (git pull, not a fresh
  # ephemeral clone every run).
  if ! command -v git >/dev/null 2>&1; then
    printf '%s\n' "git is required to fetch the OverClick plugin package." >&2
    exit 1
  fi
  case "$plugin_source" in
    http://*|https://*|git@*|file://*) clone_url=$plugin_source ;;
    *) clone_url="https://github.com/$plugin_source.git" ;;
  esac
  mkdir -p "$overclick_root"
  if [[ -d "$plugin_src/.git" ]]; then
    if ! git -C "$plugin_src" fetch --depth 1 origin >/dev/null 2>&1 || \
      ! git -C "$plugin_src" reset --hard origin/HEAD >/dev/null 2>&1; then
      printf '%s\n' "Could not update the local OverClick plugin checkout at $plugin_src." >&2
      exit 1
    fi
  else
    rm -rf -- "$plugin_src"
    if ! git clone --depth 1 "$clone_url" "$plugin_src" >/dev/null 2>&1; then
      printf '%s\n' "Could not clone the OverClick plugin package." >&2
      exit 1
    fi
  fi
  source_root="$plugin_src"
fi

if [[ ! -f "$source_root/plugin/.codex-plugin/plugin.json" || ! -f "$source_root/plugin/OVERCLICK.md" ]]; then
  printf '%s\n' "The retrieved package is missing required plugin files." >&2
  exit 1
fi

mkdir -p "$plugin_target"
cp -R "$source_root/plugin/." "$plugin_target/"

enforce_stop=$(read_private_setting enforce_stop 2>/dev/null || printf '0')
enforce_harness=$(read_private_setting enforce_harness 2>/dev/null || printf '0')
enforce_claim=$(read_private_setting enforce_claim 2>/dev/null || printf '0')
cat >"$private_config" <<EOF
url=$mcp_url
token=$token
enforce_stop=$enforce_stop
enforce_harness=$enforce_harness
enforce_claim=$enforce_claim
EOF
chmod 600 "$private_config"

toml_quote() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '"%s"' "$value"
}

replace_marked_block() {
  local file=$1 block=$2 directory temporary
  directory=$(dirname -- "$file")
  mkdir -p "$directory"
  temporary=$(mktemp "$directory/.overclick.XXXXXX")
  if [[ -f "$file" ]]; then
    awk '
      /<!-- overclick:start -->/ { skip=1; next }
      /<!-- overclick:end -->/ { skip=0; next }
      !skip { print }
    ' "$file" >"$temporary"
  fi
  if [[ -s "$temporary" ]]; then printf '\n' >>"$temporary"; fi
  printf '%s\n' "$block" >>"$temporary"
  mv "$temporary" "$file"
}

write_codex_mcp() {
  local file="$install_home/.codex/config.toml" directory temporary quoted_url quoted_header
  directory=$(dirname -- "$file")
  mkdir -p "$directory"
  temporary=$(mktemp "$directory/.config.XXXXXX")
  if [[ -f "$file" ]]; then
    awk '
      /^# overclick:start$/ { skip=1; next }
      /^# overclick:end$/ { skip=0; next }
      !skip { print }
    ' "$file" >"$temporary"
  fi
  quoted_url=$(toml_quote "$mcp_url")
  quoted_header=$(toml_quote "Bearer $token")
  if [[ -s "$temporary" ]]; then printf '\n' >>"$temporary"; fi
  {
    printf '%s\n' '# overclick:start'
    printf '%s\n' '[mcp_servers.overclick]'
    printf 'url = %s\n' "$quoted_url"
    printf 'http_headers = { Authorization = %s }\n' "$quoted_header"
    printf '%s\n' '# overclick:end'
  } >>"$temporary"
  mv "$temporary" "$file"
  chmod 600 "$file"
}

merge_json_config() {
  local mode=$1 file=$2 source_hooks=${3:-}
  mkdir -p "$(dirname -- "$file")"
  if command -v python3 >/dev/null 2>&1; then
    OC_JSON_MODE=$mode OC_JSON_FILE=$file OC_MCP_URL=$mcp_url OC_MCP_TOKEN=$token \
      OC_HOOK_SOURCE=$source_hooks OC_PLUGIN_TARGET=$plugin_target python3 <<'PY'
import json, os, pathlib, tempfile

path = pathlib.Path(os.environ["OC_JSON_FILE"])
if path.exists():
    try:
        data = json.loads(path.read_text())
    except Exception as exc:
        raise SystemExit(f"Refusing to replace invalid JSON config: {exc}")
else:
    data = {}

mode = os.environ["OC_JSON_MODE"]
if mode == "mcp":
    data.setdefault("mcpServers", {})["overclick"] = {
        "type": "http",
        "url": os.environ["OC_MCP_URL"],
        "headers": {"Authorization": "Bearer " + os.environ["OC_MCP_TOKEN"]},
    }
elif mode in ("hooks", "hooks-no-claim-guard"):
    source = json.loads(pathlib.Path(os.environ["OC_HOOK_SOURCE"]).read_text())
    target = os.environ["OC_PLUGIN_TARGET"]
    hooks = data.setdefault("hooks", {})
    for event, rules in source.get("hooks", {}).items():
        kept = []
        for rule in hooks.get(event, []):
            commands = [h.get("command", "") for h in rule.get("hooks", [])]
            if not any("overclick" in command.lower() for command in commands):
                kept.append(rule)
        for rule in rules:
            if mode == "hooks-no-claim-guard" and any("claim-guard.sh" in hook.get("command", "") for hook in rule.get("hooks", [])):
                continue
            serialized = json.dumps(rule).replace("${CLAUDE_PLUGIN_ROOT}", target)
            kept.append(json.loads(serialized))
        hooks[event] = kept

path.parent.mkdir(parents=True, exist_ok=True)
fd, temp_name = tempfile.mkstemp(prefix=".overclick-", dir=path.parent)
with os.fdopen(fd, "w") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
os.replace(temp_name, path)
os.chmod(path, 0o600)
PY
    return
  fi

  if command -v node >/dev/null 2>&1; then
    OC_JSON_MODE=$mode OC_JSON_FILE=$file OC_MCP_URL=$mcp_url OC_MCP_TOKEN=$token \
      OC_HOOK_SOURCE=$source_hooks OC_PLUGIN_TARGET=$plugin_target node <<'JS'
const fs = require("node:fs");
const path = require("node:path");
const file = process.env.OC_JSON_FILE;
let data = {};
if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, "utf8"));
if (process.env.OC_JSON_MODE === "mcp") {
  data.mcpServers ??= {};
  data.mcpServers.overclick = {
    type: "http",
    url: process.env.OC_MCP_URL,
    headers: { Authorization: "Bearer " + process.env.OC_MCP_TOKEN },
  };
} else {
  const source = JSON.parse(fs.readFileSync(process.env.OC_HOOK_SOURCE, "utf8"));
  data.hooks ??= {};
  for (const [event, rules] of Object.entries(source.hooks ?? {})) {
    const kept = (data.hooks[event] ?? []).filter(rule =>
      !(rule.hooks ?? []).some(h => (h.command ?? "").toLowerCase().includes("overclick"))
    );
    const selected = process.env.OC_JSON_MODE === "hooks-no-claim-guard"
      ? rules.filter(rule => !(rule.hooks ?? []).some(hook => (hook.command ?? "").includes("claim-guard.sh")))
      : rules;
    const serialized = JSON.stringify(selected).split("${CLAUDE_PLUGIN_ROOT}").join(process.env.OC_PLUGIN_TARGET);
    data.hooks[event] = [...kept, ...JSON.parse(serialized)];
  }
}
fs.mkdirSync(path.dirname(file), { recursive: true });
const temp = file + ".overclick-" + process.pid;
fs.writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
fs.renameSync(temp, file);
fs.chmodSync(file, 0o600);
JS
    return
  fi

  printf '%s\n' "A JSON runtime is required to merge existing agent configuration safely." >&2
  return 1
}

# Native managers install this private copy, so plugin-level MCP declarations
# work without requiring shell profile edits. The repository package remains a
# generic environment-variable template.
merge_json_config mcp "$plugin_target/.mcp.json"
merge_json_config mcp "$plugin_target/kimi.plugin.json"
chmod 600 "$plugin_target/.mcp.json" "$plugin_target/kimi.plugin.json"

native_marketplace="$overclick_root/native-marketplace"
mkdir -p "$native_marketplace/.claude-plugin" "$native_marketplace/.grok-plugin" "$native_marketplace/plugin"
cp "$source_root/.claude-plugin/marketplace.json" "$native_marketplace/.claude-plugin/marketplace.json"
cp "$source_root/.grok-plugin/marketplace.json" "$native_marketplace/.grok-plugin/marketplace.json"
cp -R "$plugin_target/." "$native_marketplace/plugin/"

if [[ -n "${OVERCLICK_CLIS:-}" ]]; then
  detected_clis=",${OVERCLICK_CLIS// /},"
else
  detected_clis=","
  for candidate in claude codex grok kimi; do
    if command -v "$candidate" >/dev/null 2>&1; then
      detected_clis+="$candidate,"
    fi
  done
fi

has_cli() {
  [[ "$detected_clis" == *",$1,"* ]]
}

quiet_try() {
  local label=$1
  shift
  if "$@" >/dev/null 2>&1; then
    printf '%s\n' "$label configured."
  else
    printf '%s\n' "$label needs manual confirmation in its native plugin manager." >&2
  fi
}

# "Successfully installed" only means the CLI accepted the command; the
# github-source bug this fixes accepted it and never materialized anything.
# Ask the CLI what it actually has on disk instead of trusting exit codes.
verify_claude_plugin() {
  local listing
  listing=$(claude plugin list --json 2>/dev/null) || return 1
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$listing" | python3 -c '
import json, sys
try:
    plugins = json.load(sys.stdin)
except Exception:
    sys.exit(1)
for entry in plugins:
    if str(entry.get("id", "")).startswith("overclick@") and entry.get("enabled"):
        print(entry.get("installPath", ""))
        sys.exit(0)
sys.exit(1)
'
    return $?
  fi
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$listing" | node -e '
let data = "";
process.stdin.on("data", chunk => { data += chunk; });
process.stdin.on("end", () => {
  let plugins;
  try { plugins = JSON.parse(data); } catch { process.exit(1); }
  const found = plugins.find(p => String(p.id || "").startsWith("overclick@") && p.enabled);
  if (!found) process.exit(1);
  process.stdout.write(String(found.installPath || ""));
});
'
    return $?
  fi
  return 1
}

validation_failed=0

if has_cli claude; then
  if claude plugin marketplace add "$native_marketplace" --scope user >/dev/null 2>&1 || \
    claude plugin marketplace update overclick >/dev/null 2>&1; then
    printf '%s\n' "Claude marketplace configured."
  else
    printf '%s\n' "Claude marketplace needs manual confirmation in its native plugin manager." >&2
  fi
  if claude plugin install overclick@overclick --scope user >/dev/null 2>&1 || \
    claude plugin update overclick@overclick --scope user >/dev/null 2>&1; then
    printf '%s\n' "Claude plugin configured."
  else
    printf '%s\n' "Claude plugin needs manual confirmation in its native plugin manager." >&2
  fi
  claude mcp remove overclick --scope user >/dev/null 2>&1 || true
  quiet_try "Claude MCP" claude mcp add --transport http --scope user \
    --header "Authorization: Bearer $token" overclick "$mcp_url"
  claude_block=$(printf '%s\n' '<!-- overclick:start -->' "@$plugin_target/OVERCLICK.md" '<!-- overclick:end -->')
  replace_marked_block "$install_home/.claude/CLAUDE.md" "$claude_block"

  claude_install_path=$(verify_claude_plugin) || claude_install_path=""
  if [[ -n "$claude_install_path" && -f "$claude_install_path/OVERCLICK.md" ]]; then
    printf '%s\n' "Claude plugin verified: enabled and materialized at $claude_install_path."
  else
    printf '%s\n' "Claude plugin did not materialize: 'claude plugin list --json' shows no enabled overclick entry with OVERCLICK.md on disk. Do not trust the earlier \"configured\" messages; retry or install manually." >&2
    validation_failed=1
  fi
fi

if has_cli codex; then
  codex_marketplace="$overclick_root/codex-marketplace"
  codex_plugin="$codex_marketplace/.agents/plugins/overclick"
  mkdir -p "$codex_plugin"
  cp -R "$plugin_target/." "$codex_plugin/"
  cat >"$codex_marketplace/.agents/plugins/marketplace.json" <<'JSON'
{
  "name": "overclick",
  "interface": { "displayName": "OverClick" },
  "plugins": [
    {
      "name": "overclick",
      "source": { "source": "local", "path": "./plugins/overclick" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
JSON
  quiet_try "Codex marketplace" codex plugin marketplace add "$codex_marketplace"
  quiet_try "Codex plugin" codex plugin add overclick@overclick
  write_codex_mcp
  # Codex has no supported client-side claim guard. Keep the existing lifecycle
  # integrations, while claim enforcement remains on the board for this CLI.
  merge_json_config hooks-no-claim-guard "$install_home/.codex/hooks.json" "$plugin_target/hooks/hooks.json"
fi

if has_cli grok; then
  if grok plugin marketplace add "$native_marketplace" >/dev/null 2>&1 || \
    grok plugin marketplace update overclick >/dev/null 2>&1; then
    printf '%s\n' "Grok marketplace configured."
  else
    printf '%s\n' "Grok marketplace needs manual confirmation in its native plugin manager." >&2
  fi
  if grok plugin install "$plugin_target" --trust >/dev/null 2>&1 || \
    grok plugin update overclick >/dev/null 2>&1; then
    printf '%s\n' "Grok plugin configured."
  else
    printf '%s\n' "Grok plugin needs manual confirmation in its native plugin manager." >&2
  fi
  grok mcp remove --scope user overclick >/dev/null 2>&1 || true
  quiet_try "Grok MCP" grok mcp add --transport http --scope user \
    --header "Authorization: Bearer $token" overclick "$mcp_url"
fi

if has_cli kimi; then
  kimi_plugin_path=${plugin_target//\\/\\\\}
  kimi_plugin_path=${kimi_plugin_path//\"/\\\"}
  quiet_try "Kimi plugin" kimi --auto --prompt "/plugins install \"$kimi_plugin_path\""
  merge_json_config mcp "$install_home/.kimi-code/mcp.json"
  quiet_try "Kimi MCP" kimi --auto --prompt "/plugins mcp enable overclick overclick"
fi

if [[ "${OVERCLICK_AGENTS_FALLBACK:-0}" = "1" ]] || \
  { ! has_cli claude && ! has_cli codex && ! has_cli grok && ! has_cli kimi; }; then
  agents_block=$(printf '%s\n' '<!-- overclick:start -->' "Read and follow $plugin_target/OVERCLICK.md for all OverClick board work." '<!-- overclick:end -->')
  replace_marked_block "$project_dir/AGENTS.md" "$agents_block"
  printf '%s\n' "No plugin-capable CLI was detected; the AGENTS.md fallback was installed."
fi

if [[ "$validation_failed" = "1" ]]; then
  printf '%s\n' "OverClick plugin installation finished with unverified components; see warnings above. Credentials were stored privately and were not displayed." >&2
  exit 1
fi

printf '%s\n' "OverClick plugin installation complete. Credentials were stored privately and were not displayed."
