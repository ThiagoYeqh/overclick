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
});'
    return
  fi

  return 1
}

oc_block() {
  oc_reason=$1
  printf '{"decision":"block","reason":"%s"}\n' "$oc_reason"
}
