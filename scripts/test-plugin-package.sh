#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT
FIXTURE_URL=$(printf '%s%s%s' 'https' '://' 'fixture')

jq -e '.skills and .mcpServers and (has("hooks") | not) and (has("commands") | not)' \
  "$REPO_ROOT/plugin/.codex-plugin/plugin.json" >/dev/null
jq -e '.skills and .mcpServers and (.hooks | length == 6) and .commands' \
  "$REPO_ROOT/plugin/kimi.plugin.json" >/dev/null
jq -e '.hooks | keys | sort == ["PostToolUse", "PreToolUse", "SessionStart", "Stop"]' \
  "$REPO_ROOT/plugin/hooks/hooks.json" >/dev/null
jq -e '(.hooks.PostToolUse | length == 2) and (.hooks.PreToolUse | length == 2)' \
  "$REPO_ROOT/plugin/hooks/hooks.json" >/dev/null
test -x "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test "$(find "$REPO_ROOT/plugin/commands" -name '*.md' | wc -l | tr -d ' ')" -eq 5
test "$(find "$REPO_ROOT/plugin" "$REPO_ROOT/skills" -name SKILL.md | wc -l | tr -d ' ')" -eq 1

mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/home/.codex" "$TEST_ROOT/project" "$TEST_ROOT/claude-cache"
touch "$TEST_ROOT/claude-cache/OVERCLICK.md"
cat >"$TEST_ROOT/bin/agent-stub" <<'SH'
#!/bin/sh
printf '%s:%s:%s\n' "$(basename -- "$0")" "${1:-}" "${2:-}" >>"$OC_TEST_NATIVE_LOG"
if [ "$(basename -- "$0")" = "claude" ] && [ "${1:-}" = "plugin" ] && [ "${2:-}" = "list" ]; then
  printf '[{"id":"overclick@overclick","enabled":true,"installPath":"%s"}]' "$OC_TEST_CLAUDE_CACHE"
fi
exit 0
SH
chmod +x "$TEST_ROOT/bin/agent-stub"
for cli in claude codex grok kimi; do
  ln -s agent-stub "$TEST_ROOT/bin/$cli"
done

cat >"$TEST_ROOT/home/.codex/hooks.json" <<'JSON'
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [{ "type": "command", "command": "existing-hook" }]
      }
    ]
  }
}
JSON

run_installer() {
  PATH="$TEST_ROOT/bin:$PATH" \
  OC_TEST_NATIVE_LOG="$TEST_ROOT/native.log" \
  OC_TEST_CLAUDE_CACHE="$TEST_ROOT/claude-cache" \
  OVERCLICK_INSTALL_HOME="$TEST_ROOT/home" \
  OVERCLICK_PROJECT_DIR="$TEST_ROOT/project" \
  OVERCLICK_INSTANCE_URL="$FIXTURE_URL" \
  OVERCLICK_TOKEN="fixture" \
  OVERCLICK_CLIS="claude,codex,grok,kimi" \
    "$REPO_ROOT/install.sh" >"$TEST_ROOT/install.out" 2>"$TEST_ROOT/install.err"
}

run_installer
run_installer

if grep -q 'fixture' "$TEST_ROOT/install.out" "$TEST_ROOT/install.err"; then
  echo "installer exposed private input" >&2
  exit 1
fi

test "$(grep -c '<!-- overclick:start -->' "$TEST_ROOT/home/.claude/CLAUDE.md")" -eq 1
test "$(grep -c '^# overclick:start$' "$TEST_ROOT/home/.codex/config.toml")" -eq 1
test "$(grep -c 'existing-hook' "$TEST_ROOT/home/.codex/hooks.json")" -eq 1
test "$(grep -c 'session-start.sh' "$TEST_ROOT/home/.codex/hooks.json")" -eq 1
test "$(grep -c 'claim-guard.sh' "$TEST_ROOT/home/.codex/hooks.json" || true)" -eq 0
test "$(grep -c '^enforce_claim=0$' "$TEST_ROOT/home/.config/overclick/config")" -eq 1
test "$(grep -c '^token=' "$TEST_ROOT/home/.config/overclick/config")" -eq 1
test "$(stat -f '%Lp' "$TEST_ROOT/home/.config/overclick/config" 2>/dev/null || stat -c '%a' "$TEST_ROOT/home/.config/overclick/config")" -eq 600
sed -i.bak 's/enforce_claim=0/enforce_claim=1/' "$TEST_ROOT/home/.config/overclick/config"
run_installer
test "$(grep -c '^enforce_claim=1$' "$TEST_ROOT/home/.config/overclick/config")" -eq 1

# "Successfully installed" is not proof of anything: a marketplace entry that
# never fetched its package still exits 0. The installer must ask the CLI
# what it actually has on disk and fail loudly when that comes up empty.
mkdir -p "$TEST_ROOT/claude-cache-empty"
if PATH="$TEST_ROOT/bin:$PATH" \
  OC_TEST_NATIVE_LOG="$TEST_ROOT/native-unverified.log" \
  OC_TEST_CLAUDE_CACHE="$TEST_ROOT/claude-cache-empty" \
  OVERCLICK_INSTALL_HOME="$TEST_ROOT/home-unverified" \
  OVERCLICK_PROJECT_DIR="$TEST_ROOT/project" \
  OVERCLICK_INSTANCE_URL="$FIXTURE_URL" \
  OVERCLICK_TOKEN="fixture" \
  OVERCLICK_CLIS="claude" \
    "$REPO_ROOT/install.sh" >"$TEST_ROOT/unverified.out" 2>"$TEST_ROOT/unverified.err"; then
  echo "installer should fail loudly when the Claude plugin never materializes" >&2
  exit 1
fi
grep -Fq 'did not materialize' "$TEST_ROOT/unverified.err"

# The github-source bug this fixes never gives install.sh a local checkout to
# reuse. Exercise that path directly: a bare install.sh copy, no plugin/ next
# to it, sourcing a local git remote instead of network github.
mkdir -p "$TEST_ROOT/plugin-remote/plugin/.codex-plugin" \
  "$TEST_ROOT/plugin-remote/.claude-plugin" "$TEST_ROOT/plugin-remote/.grok-plugin"
git init -q "$TEST_ROOT/plugin-remote"
git -C "$TEST_ROOT/plugin-remote" config user.name fixture
git -C "$TEST_ROOT/plugin-remote" config user.email fixture@invalid
printf 'package v1\n' >"$TEST_ROOT/plugin-remote/plugin/OVERCLICK.md"
printf '{}' >"$TEST_ROOT/plugin-remote/plugin/.codex-plugin/plugin.json"
printf '{}' >"$TEST_ROOT/plugin-remote/.claude-plugin/marketplace.json"
printf '{}' >"$TEST_ROOT/plugin-remote/.grok-plugin/marketplace.json"
git -C "$TEST_ROOT/plugin-remote" add -A
git -C "$TEST_ROOT/plugin-remote" commit -q -m v1

mkdir -p "$TEST_ROOT/isolated-installer" "$TEST_ROOT/clone-cache"
cp "$REPO_ROOT/install.sh" "$TEST_ROOT/isolated-installer/install.sh"
chmod +x "$TEST_ROOT/isolated-installer/install.sh"
touch "$TEST_ROOT/clone-cache/OVERCLICK.md"

run_clone_installer() {
  PATH="$TEST_ROOT/bin:$PATH" \
  OC_TEST_NATIVE_LOG="$TEST_ROOT/clone-native.log" \
  OC_TEST_CLAUDE_CACHE="$TEST_ROOT/clone-cache" \
  OVERCLICK_INSTALL_HOME="$TEST_ROOT/clone-home" \
  OVERCLICK_PROJECT_DIR="$TEST_ROOT/project" \
  OVERCLICK_INSTANCE_URL="$FIXTURE_URL" \
  OVERCLICK_TOKEN="fixture" \
  OVERCLICK_CLIS="claude" \
  OVERCLICK_PLUGIN_SOURCE="file://$TEST_ROOT/plugin-remote" \
    "$TEST_ROOT/isolated-installer/install.sh" >"$TEST_ROOT/clone.out" 2>"$TEST_ROOT/clone.err"
}

run_clone_installer
plugin_src="$TEST_ROOT/clone-home/.config/overclick/plugin-src"
test -d "$plugin_src/.git"
grep -Fq 'package v1' "$plugin_src/plugin/OVERCLICK.md"

printf 'package v2\n' >"$TEST_ROOT/plugin-remote/plugin/OVERCLICK.md"
git -C "$TEST_ROOT/plugin-remote" add -A
git -C "$TEST_ROOT/plugin-remote" commit -q -m v2

run_clone_installer
grep -Fq 'package v2' "$plugin_src/plugin/OVERCLICK.md"

OVERCLICK_INSTALL_HOME="$TEST_ROOT/home-fallback" \
OVERCLICK_PROJECT_DIR="$TEST_ROOT/project" \
OVERCLICK_INSTANCE_URL="$FIXTURE_URL" \
OVERCLICK_TOKEN="fixture" \
OVERCLICK_CLIS="other" \
  "$REPO_ROOT/install.sh" >"$TEST_ROOT/fallback.out" 2>"$TEST_ROOT/fallback.err"
OVERCLICK_INSTALL_HOME="$TEST_ROOT/home-fallback" \
OVERCLICK_PROJECT_DIR="$TEST_ROOT/project" \
OVERCLICK_INSTANCE_URL="$FIXTURE_URL" \
OVERCLICK_TOKEN="fixture" \
OVERCLICK_CLIS="other" \
  "$REPO_ROOT/install.sh" >"$TEST_ROOT/fallback.out" 2>"$TEST_ROOT/fallback.err"
test "$(grep -c '<!-- overclick:start -->' "$TEST_ROOT/project/AGENTS.md")" -eq 1

cat >"$TEST_ROOT/bin/curl" <<'SH'
#!/bin/sh
body=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--data-binary" ]; then body=$argument; fi
  previous=$argument
done
case "$body" in
  *harness_recommend*)
    printf '%s' '{"result":{"structuredContent":{"harness":{"cli":"codex","model":"model-fixture","effort":"high"}}}}'
    ;;
  *task_list*)
    if [ "${OC_TEST_HAS_CLAIM:-1}" = "1" ]; then
      printf '%s' '{"result":{"structuredContent":{"tasks":[{"short_id":"T-1","title":"Fixture card","status":"em_execucao"}],"truncated":false}}}'
    else
      printf '%s' '{"result":{"structuredContent":{"tasks":[],"truncated":false}}}'
    fi
    ;;
  *)
    printf '%s' '{"result":{"structuredContent":{"tasks":[{"short_id":"T-1","title":"Fixture card","status":"em_execucao"}],"truncated":false}}}'
    ;;
esac
SH
chmod +x "$TEST_ROOT/bin/curl"

HOOK_CONFIG="$TEST_ROOT/hook-config"
cat >"$HOOK_CONFIG" <<'EOF'
url=fixture
token=fixture
enforce_stop=0
enforce_harness=0
enforce_claim=0
EOF
snapshot=$(PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/session-start.sh")
printf '%s' "$snapshot" | grep -q 'T-1'

mkdir -p "$TEST_ROOT/nojq"
for utility in python3 grep tail dirname cat date mkdir mktemp chmod mv rm sed; do
  ln -s "$(command -v "$utility")" "$TEST_ROOT/nojq/$utility"
done
ln -s "$TEST_ROOT/bin/curl" "$TEST_ROOT/nojq/curl"
python_snapshot=$(PATH="$TEST_ROOT/nojq" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/session-start.sh")
printf '%s' "$python_snapshot" | grep -q 'T-1'

mkdir -p "$TEST_ROOT/nojq-node"
for utility in node grep tail dirname cat date mkdir mktemp chmod mv rm sed; do
  ln -s "$(command -v "$utility")" "$TEST_ROOT/nojq-node/$utility"
done
ln -s "$TEST_ROOT/bin/curl" "$TEST_ROOT/nojq-node/curl"

test -z "$(PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/stop-guard.sh")"
sed -i.bak 's/enforce_stop=0/enforce_stop=1/' "$HOOK_CONFIG"
stop_result=$(PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/stop-guard.sh")
printf '%s' "$stop_result" | grep -q '"decision":"block"'

sed -i.bak 's/enforce_harness=0/enforce_harness=1/' "$HOOK_CONFIG"
matching_input='{"tool_input":{"type":"feature","harness":{"cli":"codex","model":"model-fixture","effort":"high"}}}'
test -z "$(printf '%s' "$matching_input" | PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/pre-create.sh")"
mismatched_input='{"tool_input":{"type":"feature","harness":{"cli":"codex","model":"other-model","effort":"high"}}}'
pre_result=$(printf '%s' "$mismatched_input" | PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/pre-create.sh")
printf '%s' "$pre_result" | grep -q '"decision":"block"'

write_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"session-fixture",tool_name:"Write",tool_input:{file_path:"changed.txt",content:"fixture"}}')
test -z "$(printf '%s' "$write_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")"

sed -i.bak 's/enforce_claim=0/enforce_claim=1/' "$HOOK_CONFIG"
blocked_write=$(printf '%s' "$write_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")
printf '%s' "$blocked_write" | grep -Fq 'claima um card no board antes: task_claim {id}'

read_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"session-fixture",tool_name:"Bash",tool_input:{command:"git status --short"}}')
test -z "$(printf '%s' "$read_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")"
write_bash_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"session-fixture",tool_name:"Bash",tool_input:{command:"printf fixture > changed.txt"}}')
blocked_bash=$(printf '%s' "$write_bash_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")
printf '%s' "$blocked_bash" | grep -Fq 'claima um card no board antes: task_claim {id}'

failed_claim_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"session-fixture",tool_name:"task_claim",tool_input:{task_id:"T-1"},tool_response:{isError:true,content:[{type:"text",text:"claim failed"}]}}')
printf '%s' "$failed_claim_input" | PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test ! -e "$TEST_ROOT/project/.overclick/claim.json"

claim_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"session-fixture",tool_name:"mcp__overclick__task_claim",tool_input:{task_id:"T-1"},tool_response:{structuredContent:{task:{short_id:"T-1",status:"em_execucao"},attempt:{id:"attempt-fixture",started_at:"2026-08-19T12:00:00.000Z"}}}}')
printf '%s' "$claim_input" | PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test -f "$TEST_ROOT/project/.overclick/claim.json"
test "$(stat -f '%Lp' "$TEST_ROOT/project/.overclick/claim.json" 2>/dev/null || stat -c '%a' "$TEST_ROOT/project/.overclick/claim.json")" -eq 600
jq -e '.task_id == "T-1" and .claimed_at == "2026-08-19T12:00:00.000Z" and .session_id == "session-fixture"' "$TEST_ROOT/project/.overclick/claim.json" >/dev/null
test -z "$(printf '%s' "$write_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")"
other_session_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"another-session",tool_name:"Write",tool_input:{file_path:"changed.txt",content:"fixture"}}')
blocked_other_session=$(printf '%s' "$other_session_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")
printf '%s' "$blocked_other_session" | grep -Fq 'claima um card no board antes: task_claim {id}'

deliver_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"session-fixture",tool_name:"mcp__overclick__task_deliver",tool_input:{task_id:"T-1"}}')
printf '%s' "$deliver_input" | PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test ! -e "$TEST_ROOT/project/.overclick/claim.json"
blocked_after_deliver=$(printf '%s' "$write_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")
printf '%s' "$blocked_after_deliver" | grep -Fq 'claima um card no board antes: task_claim {id}'

test -z "$(printf '%s' "$write_input" | PATH="$TEST_ROOT/bin:$PATH" OC_TEST_HAS_CLAIM=1 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")"

printf '%s' "$claim_input" | PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
release_input=$(jq -nc --arg cwd "$TEST_ROOT/project" '{cwd:$cwd,session_id:"session-fixture",tool_name:"task_release",tool_input:{task_id:"T-1"}}')
printf '%s' "$release_input" | PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test ! -e "$TEST_ROOT/project/.overclick/claim.json"

mkdir -p "$TEST_ROOT/project-python"
python_claim_input=$(jq -nc --arg cwd "$TEST_ROOT/project-python" '{cwd:$cwd,session_id:"python-session",tool_name:"task_claim",tool_input:{task_id:"T-2"},tool_response:{structuredContent:{task:{short_id:"T-2",status:"em_execucao"},attempt:{started_at:"2026-08-19T12:30:00.000Z"}}}}')
printf '%s' "$python_claim_input" | PATH="$TEST_ROOT/nojq" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test -f "$TEST_ROOT/project-python/.overclick/claim.json"
python_write_input=$(jq -nc --arg cwd "$TEST_ROOT/project-python" '{cwd:$cwd,session_id:"python-session",tool_name:"Write",tool_input:{file_path:"changed.txt",content:"fixture"}}')
test -z "$(printf '%s' "$python_write_input" | PATH="$TEST_ROOT/nojq" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")"
python_deliver_input=$(jq -nc --arg cwd "$TEST_ROOT/project-python" '{cwd:$cwd,session_id:"python-session",tool_name:"task_deliver",tool_input:{task_id:"T-2"}}')
printf '%s' "$python_deliver_input" | PATH="$TEST_ROOT/nojq" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test ! -e "$TEST_ROOT/project-python/.overclick/claim.json"

mkdir -p "$TEST_ROOT/project-node"
node_claim_input=$(jq -nc --arg cwd "$TEST_ROOT/project-node" '{cwd:$cwd,session_id:"node-session",tool_name:"task_claim",tool_input:{task_id:"T-3"},tool_response:{structuredContent:{task:{short_id:"T-3",status:"em_execucao"},attempt:{started_at:"2026-08-19T13:00:00.000Z"}}}}')
printf '%s' "$node_claim_input" | PATH="$TEST_ROOT/nojq-node" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test -f "$TEST_ROOT/project-node/.overclick/claim.json"
node_write_input=$(jq -nc --arg cwd "$TEST_ROOT/project-node" '{cwd:$cwd,session_id:"node-session",tool_name:"Write",tool_input:{file_path:"changed.txt",content:"fixture"}}')
test -z "$(printf '%s' "$node_write_input" | PATH="$TEST_ROOT/nojq-node" OC_TEST_HAS_CLAIM=0 OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh")"
node_deliver_input=$(jq -nc --arg cwd "$TEST_ROOT/project-node" '{cwd:$cwd,session_id:"node-session",tool_name:"task_deliver",tool_input:{task_id:"T-3"}}')
printf '%s' "$node_deliver_input" | PATH="$TEST_ROOT/nojq-node" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/claim-guard.sh"
test ! -e "$TEST_ROOT/project-node/.overclick/claim.json"

mkdir -p "$TEST_ROOT/git/remote.git" "$TEST_ROOT/git/work"
git init --bare "$TEST_ROOT/git/remote.git" >/dev/null 2>&1
git -C "$TEST_ROOT/git/work" init >/dev/null 2>&1
git -C "$TEST_ROOT/git/work" config user.name fixture
git -C "$TEST_ROOT/git/work" config user.email fixture@invalid
touch "$TEST_ROOT/git/work/file"
git -C "$TEST_ROOT/git/work" add file
git -C "$TEST_ROOT/git/work" commit -m fixture >/dev/null 2>&1
git -C "$TEST_ROOT/git/work" remote add origin "$TEST_ROOT/git/remote.git"
git -C "$TEST_ROOT/git/work" push -u origin HEAD >/dev/null 2>&1
commit=$(git -C "$TEST_ROOT/git/work" rev-parse HEAD)
(cd "$TEST_ROOT/git/work" && printf '{"tool_input":{"evidence":[{"text":"commit %s"}]}}' "$commit" | "$REPO_ROOT/plugin/hooks/post-deliver.sh")

echo "plugin package checks passed"
