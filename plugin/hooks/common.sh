#!/bin/sh

# Shared, side-effect-free helpers for every OverClick hook.

oc_config_file() {
  if [ -n "${OVERCLICK_CONFIG_FILE:-}" ]; then
    printf '%s' "$OVERCLICK_CONFIG_FILE"
    return
  fi
  printf '%s' "${XDG_CONFIG_HOME:-$HOME/.config}/overclick/config"
}

oc_setting() {
  oc_key=$1
  oc_file=$(oc_config_file)
  [ -f "$oc_file" ] || return 1
  oc_line=$(grep -E "^${oc_key}=" "$oc_file" 2>/dev/null | tail -n 1) || return 1
  printf '%s' "${oc_line#*=}"
}

oc_enabled() {
  [ "$(oc_setting "$1" 2>/dev/null || true)" = "1" ]
}

oc_mcp_call() {
  oc_tool=$1
  oc_arguments=$2
  oc_url=$(oc_setting url 2>/dev/null || true)
  oc_token=$(oc_setting token 2>/dev/null || true)
  [ -n "$oc_url" ] && [ -n "$oc_token" ] || return 1

  oc_body=$(printf \
    '{"jsonrpc":"2.0","id":"overclick-hook","method":"tools/call","params":{"name":"%s","arguments":%s}}' \
    "$oc_tool" "$oc_arguments")
  curl --fail --silent --show-error --connect-timeout 3 --max-time 12 \
    --header 'Accept: application/json, text/event-stream' \
    --header 'Content-Type: application/json' \
    --header "Authorization: Bearer $oc_token" \
    --data-binary "$oc_body" "$oc_url" 2>/dev/null
}

oc_with_json() {
  oc_mode=$1
  shift
  if command -v jq >/dev/null 2>&1; then
    case "$oc_mode" in
      render)
        oc_heading=$1
        jq -r --arg heading "$oc_heading" '
          def payload:
            .result.structuredContent //
            (.result.content[0].text | fromjson);
          (payload) as $p |
          $heading,
          (if ($p.tasks | length) == 0 then "- none"
           else $p.tasks[] | "- \(.short_id): \(.title) [\(.status)]" end),
          (if $p.truncated then "- more cards omitted" else empty end)
        '
        ;;
      count)
        jq -r '
          def payload:
            .result.structuredContent //
            (.result.content[0].text | fromjson);
          payload.tasks | length
        '
        ;;
      hook-harness)
        jq -r '[.tool_input.harness.cli, .tool_input.harness.model, .tool_input.harness.effort] | map(. // "") | join("|")'
        ;;
      recommendation-harness)
        jq -r '
          def payload:
            .result.structuredContent //
            (.result.content[0].text | fromjson);
          [payload.harness.cli, payload.harness.model, payload.harness.effort] | map(. // "") | join("|")
        '
        ;;
      hook-tool)
        jq -r '.tool_name // .toolName // ""'
        ;;
      hook-cwd)
        jq -r '.cwd // .working_directory // .workingDirectory // ""'
        ;;
      hook-session)
        jq -r '.session_id // .sessionId // ""'
        ;;
      hook-command)
        jq -r '.tool_input.command // .tool_input.cmd // ""'
        ;;
      claim-marker)
        oc_claimed_at=${1:-}
        jq -c --arg fallback_claimed_at "$oc_claimed_at" '
          def response:
            .tool_response // .toolResponse // .tool_result // .toolResult // {};
          def payload:
            response.structuredContent //
            response.result.structuredContent //
            (try (response.content[0].text | fromjson)) //
            (try (response.result.content[0].text | fromjson)) //
            {};
          response as $r |
          payload as $p |
          {
            task_id: ($p.task.short_id // $p.task.id // .tool_input.task_id // .tool_input.id // ""),
            claimed_at: ($p.attempt.started_at // $p.attempt.startedAt // $fallback_claimed_at),
            session_id: (.session_id // .sessionId // "")
          }
          | select(($r.isError // $r.result.isError // false) != true)
          | select(.task_id != "" and .claimed_at != "")
          | select(($p.task.status // "em_execucao") == "em_execucao")
        '
        ;;
      marker-valid)
        oc_expected_session=${1:-}
        jq -e --arg session "$oc_expected_session" '
          type == "object" and
          (.task_id | type == "string" and length > 0) and
          (.claimed_at | type == "string" and length > 0) and
          ((.session_id // "") == "" or $session == "" or .session_id == $session)
        ' >/dev/null
        ;;
    esac
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    OC_JSON_MODE=$oc_mode OC_JSON_ARG=${1:-} python3 -c '
import json, os, sys
data = json.load(sys.stdin)
mode = os.environ["OC_JSON_MODE"]
def payload(value):
    result = value.get("result", {})
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    text = ((result.get("content") or [{}])[0]).get("text", "{}")
    return json.loads(text)
if mode == "render":
    p = payload(data); print(os.environ.get("OC_JSON_ARG", "OverClick"))
    tasks = p.get("tasks", [])
    if not tasks: print("- none")
    for task in tasks:
        print("- {}: {} [{}]".format(task.get("short_id", "?"), task.get("title", "Untitled"), task.get("status", "?")))
    if p.get("truncated"): print("- more cards omitted")
elif mode == "count": print(len(payload(data).get("tasks", [])))
elif mode == "hook-harness":
    h = data.get("tool_input", {}).get("harness", {})
    print("|".join(str(h.get(k) or "") for k in ("cli", "model", "effort")))
elif mode == "recommendation-harness":
    h = payload(data).get("harness", {})
    print("|".join(str(h.get(k) or "") for k in ("cli", "model", "effort")))
elif mode == "hook-tool": print(data.get("tool_name") or data.get("toolName") or "")
elif mode == "hook-cwd": print(data.get("cwd") or data.get("working_directory") or data.get("workingDirectory") or "")
elif mode == "hook-session": print(data.get("session_id") or data.get("sessionId") or "")
elif mode == "hook-command":
    tool_input = data.get("tool_input") or {}
    print(tool_input.get("command") or tool_input.get("cmd") or "")
elif mode == "claim-marker":
    response = data.get("tool_response") or data.get("toolResponse") or data.get("tool_result") or data.get("toolResult") or {}
    result = response.get("result") or {}
    p = response.get("structuredContent") or result.get("structuredContent")
    if not isinstance(p, dict):
        content = response.get("content") or result.get("content") or []
        try: p = json.loads((content[0] if content else {}).get("text", "{}"))
        except (TypeError, ValueError): p = {}
    task, attempt = p.get("task") or {}, p.get("attempt") or {}
    task_input = data.get("tool_input") or {}
    task_id = task.get("short_id") or task.get("id") or task_input.get("task_id") or task_input.get("id") or ""
    claimed_at = attempt.get("started_at") or attempt.get("startedAt") or os.environ.get("OC_JSON_ARG", "")
    is_error = bool(response.get("isError") or result.get("isError"))
    if task_id and claimed_at and not is_error and (task.get("status") or "em_execucao") == "em_execucao":
        print(json.dumps({"task_id": task_id, "claimed_at": claimed_at, "session_id": data.get("session_id") or data.get("sessionId") or ""}, separators=(",", ":")))
elif mode == "marker-valid":
    session = os.environ.get("OC_JSON_ARG", "")
    valid = isinstance(data, dict) and isinstance(data.get("task_id"), str) and bool(data["task_id"]) and isinstance(data.get("claimed_at"), str) and bool(data["claimed_at"])
    marker_session = data.get("session_id") or ""
    if marker_session and session and marker_session != session: valid = False
    raise SystemExit(0 if valid else 1)
'
    return
  fi

  if command -v node >/dev/null 2>&1; then
    # shellcheck disable=SC2016
    OC_JSON_MODE=$oc_mode OC_JSON_ARG=${1:-} node -e '
let raw="";process.stdin.on("data",c=>raw+=c).on("end",()=>{
 const d=JSON.parse(raw), mode=process.env.OC_JSON_MODE;
 const payload=x=>x.result?.structuredContent??JSON.parse(x.result?.content?.[0]?.text??"{}");
 const sig=h=>["cli","model","effort"].map(k=>h?.[k]??"").join("|");
 if(mode==="render"){
  const p=payload(d),tasks=p.tasks??[];console.log(process.env.OC_JSON_ARG??"OverClick");
  if(!tasks.length) console.log("- none");
  for(const t of tasks) console.log(`- ${t.short_id??"?"}: ${t.title??"Untitled"} [${t.status??"?"}]`);
  if(p.truncated) console.log("- more cards omitted");
 } else if(mode==="count") console.log((payload(d).tasks??[]).length);
 else if(mode==="hook-harness") console.log(sig(d.tool_input?.harness));
 else if(mode==="recommendation-harness") console.log(sig(payload(d).harness));
 else if(mode==="hook-tool") console.log(d.tool_name??d.toolName??"");
 else if(mode==="hook-cwd") console.log(d.cwd??d.working_directory??d.workingDirectory??"");
 else if(mode==="hook-session") console.log(d.session_id??d.sessionId??"");
 else if(mode==="hook-command") console.log(d.tool_input?.command??d.tool_input?.cmd??"");
 else if(mode==="claim-marker"){
  const r=d.tool_response??d.toolResponse??d.tool_result??d.toolResult??{}, result=r.result??{};
  let p=r.structuredContent??result.structuredContent;
  if(!p){try{p=JSON.parse((r.content??result.content??[])[0]?.text??"{}")}catch{p={}}}
  const task=p.task??{},attempt=p.attempt??{},input=d.tool_input??{};
  const taskId=task.short_id??task.id??input.task_id??input.id??"";
  const claimedAt=attempt.started_at??attempt.startedAt??process.env.OC_JSON_ARG??"";
  const isError=Boolean(r.isError??result.isError??false);
  if(taskId&&claimedAt&&!isError&&(task.status??"em_execucao")==="em_execucao") console.log(JSON.stringify({task_id:taskId,claimed_at:claimedAt,session_id:d.session_id??d.sessionId??""}));
 } else if(mode==="marker-valid"){
  const session=process.env.OC_JSON_ARG??"", markerSession=d.session_id??"";
  const valid=d&&typeof d==="object"&&typeof d.task_id==="string"&&d.task_id.length>0&&typeof d.claimed_at==="string"&&d.claimed_at.length>0&&(!markerSession||!session||markerSession===session);
  process.exitCode=valid?0:1;
 }
});'
    return
  fi

  return 1
}

oc_block() {
  oc_reason=$1
  printf '{"decision":"block","reason":"%s"}\n' "$oc_reason"
}

oc_claim_file() {
  oc_root=${1:-}
  [ -n "$oc_root" ] || oc_root=$(pwd)
  if [ "$oc_root" = "/" ]; then
    printf '%s' '/.overclick/claim.json'
  else
    printf '%s' "${oc_root%/}/.overclick/claim.json"
  fi
}

oc_write_claim_marker() {
  oc_root=$1
  oc_marker=$2
  oc_file=$(oc_claim_file "$oc_root")
  oc_directory=${oc_file%/*}
  mkdir -p "$oc_directory"
  oc_temporary=$(mktemp "$oc_directory/.claim.XXXXXX")
  if ! printf '%s\n' "$oc_marker" >"$oc_temporary"; then
    rm -f -- "$oc_temporary"
    return 1
  fi
  chmod 600 "$oc_temporary"
  mv -f -- "$oc_temporary" "$oc_file"
}

oc_clear_claim_marker() {
  oc_file=$(oc_claim_file "$1")
  rm -f -- "$oc_file"
}

oc_claim_marker_valid() {
  oc_file=$(oc_claim_file "$1")
  oc_session=${2:-}
  [ -f "$oc_file" ] || return 1
  oc_with_json marker-valid "$oc_session" <"$oc_file" >/dev/null 2>&1
}

oc_bash_writes() {
  oc_command=$1
  [ -n "$oc_command" ] || return 1

  # Discard output-only redirections before looking for filesystem writes.
  oc_without_null=$(printf '%s' "$oc_command" | sed -E 's/[0-9]*>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>[&][0-9]+//g')
  if printf '%s' "$oc_without_null" | grep -Eq '(^|[^<])>{1,2}[[:space:]]*[^&]'; then
    return 0
  fi

  printf '%s' "$oc_command" | grep -Eiq '(^|[;&|()[:space:]])(apply_patch|touch|mkdir|rmdir|rm|mv|cp|install|ln|chmod|chown|truncate|dd|tee)([;&|()[:space:]]|$)|(^|[;&|()[:space:]])(sed[[:space:]]+(-[^[:space:]]*)?i|perl[[:space:]]+-[^[:space:]]*i)|(^|[;&|()[:space:]])git[[:space:]]+(add|am|apply|branch|checkout|cherry-pick|clean|commit|merge|mv|rebase|reset|restore|revert|rm|stash|switch|tag|worktree)([;&|()[:space:]]|$)|(^|[;&|()[:space:]])(npm|pnpm|yarn|bun)[[:space:]]+(add|install|remove|uninstall|update|upgrade|link|unlink|publish)([;&|()[:space:]]|$)|(^|[;&|()[:space:]])(bash|sh|zsh|python3?|node)[[:space:]]+[^;&|]*([.]sh|-[cm])[;&|[:space:]]*'
}
