#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT
FIXTURE_URL=$(printf '%s%s%s' 'https' '://' 'fixture')

jq -e '.skills and .mcpServers and (has("hooks") | not) and (has("commands") | not)' \
  "$REPO_ROOT/plugin/.codex-plugin/plugin.json" >/dev/null
jq -e '.skills and .mcpServers and (.hooks | length == 4) and .commands' \
  "$REPO_ROOT/plugin/kimi.plugin.json" >/dev/null
jq -e '.hooks | keys | sort == ["PostToolUse", "PreToolUse", "SessionStart", "Stop"]' \
  "$REPO_ROOT/plugin/hooks/hooks.json" >/dev/null
test "$(find "$REPO_ROOT/plugin/commands" -name '*.md' | wc -l | tr -d ' ')" -eq 5
test "$(find "$REPO_ROOT/plugin" "$REPO_ROOT/skills" -name SKILL.md | wc -l | tr -d ' ')" -eq 1

mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/home/.codex" "$TEST_ROOT/project"
cat >"$TEST_ROOT/bin/agent-stub" <<'SH'
#!/bin/sh
printf '%s:%s:%s\n' "$(basename -- "$0")" "${1:-}" "${2:-}" >>"$OC_TEST_NATIVE_LOG"
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
test "$(grep -c '^token=' "$TEST_ROOT/home/.config/overclick/config")" -eq 1
test "$(stat -f '%Lp' "$TEST_ROOT/home/.config/overclick/config" 2>/dev/null || stat -c '%a' "$TEST_ROOT/home/.config/overclick/config")" -eq 600

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
EOF
snapshot=$(PATH="$TEST_ROOT/bin:$PATH" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/session-start.sh")
printf '%s' "$snapshot" | grep -q 'T-1'

mkdir -p "$TEST_ROOT/nojq"
for utility in python3 grep tail dirname; do
  ln -s "$(command -v "$utility")" "$TEST_ROOT/nojq/$utility"
done
ln -s "$TEST_ROOT/bin/curl" "$TEST_ROOT/nojq/curl"
python_snapshot=$(PATH="$TEST_ROOT/nojq" OVERCLICK_CONFIG_FILE="$HOOK_CONFIG" "$REPO_ROOT/plugin/hooks/session-start.sh")
printf '%s' "$python_snapshot" | grep -q 'T-1'

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
