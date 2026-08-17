/**
 * Usage collection recipes: how each CLI can measure the run it just did.
 *
 * An agent can read its own session transcript and total the token counters
 * per model exactly. Nobody ever told it how, which is why field tests ended
 * with ten workers holding board tools and reporting nothing. The board keeps
 * the recipe so the briefing can hand it over at claim time, and so a CLI
 * changing its transcript format is fixed in one place instead of in every
 * agent's head.
 */

/** What a recipe can honestly produce. */
export type RecipeYield =
  /** Exact tokens grouped by model, straight from the CLI's own transcript. */
  | "tokens_per_model"
  /** No token counters on disk: the run reports time and turns, tokens estimated. */
  | "no_tokens";

export type UsageRecipe = {
  /** Executor catalog id the recipe belongs to, or GENERIC_RECIPE_CLI. */
  cli: string;
  label: string;
  yields: RecipeYield;
  /** Prose the agent reads before running anything. */
  instructions: string;
  /** The command to run, verbatim. Empty when there is nothing to run. */
  command: string;
};

/** Where a recipe came from: shipped with the board, or edited by a human. */
export type RecipeSource = "seed" | "custom";

export type UsageRecipeRow = UsageRecipe & {
  source: RecipeSource;
  updatedBy: string | null;
  updatedAt: string | null;
};

/** The recipe used when no CLI-specific one matches. */
export const GENERIC_RECIPE_CLI = "generic";

const CLAUDE_COMMAND = `python3 - <<'PY'
import collections, glob, json, os

# Claude Code writes one jsonl per session under ~/.claude/projects/<cwd slug>.
folder = os.path.expanduser("~/.claude/projects/" + os.getcwd().replace("/", "-"))
session = os.environ.get("CLAUDE_CODE_SESSION_ID")
path = os.path.join(folder, session + ".jsonl") if session else max(
    glob.glob(folder + "/*.jsonl"), key=os.path.getmtime
)

seg, turns = collections.defaultdict(collections.Counter), 0
for line in open(path):
    try:
        entry = json.loads(line)
    except ValueError:
        continue
    message = entry.get("message") or {}
    usage = message.get("usage")
    if not usage:
        continue
    turns += 1
    counter = seg[message.get("model") or "unknown"]
    counter["input"] += usage.get("input_tokens", 0)
    counter["output"] += usage.get("output_tokens", 0)
    counter["cache_read"] += usage.get("cache_read_input_tokens", 0)
    counter["cache_write"] += usage.get("cache_creation_input_tokens", 0)

print(json.dumps({
    "segments": [dict(model=model, **dict(counter)) for model, counter in seg.items()],
    "turns": turns,
}, indent=2))
PY`;

const CODEX_COMMAND = `python3 - <<'PY'
import collections, glob, json, os

# Codex writes one rollout jsonl per session under ~/.codex/sessions/<date>/.
paths = glob.glob(os.path.expanduser("~/.codex/sessions/**/rollout-*.jsonl"), recursive=True)
here = [p for p in paths if os.getcwd() in open(p).readline()]
path = max(here or paths, key=os.path.getmtime)

seg, model, turns = collections.defaultdict(collections.Counter), "unknown", 0
for line in open(path):
    try:
        entry = json.loads(line)
    except ValueError:
        continue
    payload = entry.get("payload") or {}
    if entry.get("type") == "turn_context" and payload.get("model"):
        model = payload["model"]
    if payload.get("type") == "token_count":
        # last_token_usage is this turn's delta; total_token_usage is cumulative.
        usage = (payload.get("info") or {}).get("last_token_usage") or {}
        turns += 1
        counter = seg[model]
        cached = usage.get("cached_input_tokens", 0)
        counter["input"] += usage.get("input_tokens", 0) - cached
        counter["cache_read"] += cached
        counter["cache_write"] += usage.get("cache_write_input_tokens", 0)
        counter["output"] += usage.get("output_tokens", 0)

print(json.dumps({
    "segments": [dict(model=model, **dict(counter)) for model, counter in seg.items()],
    "turns": turns,
}, indent=2))
PY`;

const SEED: UsageRecipe[] = [
  {
    cli: "claude-code",
    label: "Claude Code",
    yields: "tokens_per_model",
    instructions:
      "Run this from the repo you worked in. It reads your own session transcript and prints tokens grouped by model, ready to paste into task_deliver as usage.segments. Numbers from the transcript are measured, not guessed, so deliver them without estimated.",
    command: CLAUDE_COMMAND,
  },
  {
    cli: "codex",
    label: "Codex",
    yields: "tokens_per_model",
    instructions:
      "Run this from the repo you worked in. It reads the session rollout, attributes each turn to the model that was active, and prints tokens grouped by model for usage.segments. Check that the totals look like your session before sending: with several Codex sessions open it picks the newest rollout whose recorded cwd is this one.",
    command: CODEX_COMMAND,
  },
  {
    cli: "gemini-cli",
    label: "Gemini CLI",
    yields: "no_tokens",
    instructions:
      "Gemini CLI keeps a chat transcript under ~/.gemini/tmp/<project>/chats but records no token counters in it, so there is nothing on disk to total. Report the duration and the turns you can count, estimate the tokens, and set estimated: true so the card labels them as an estimate instead of showing nothing. If your version starts writing usage into that transcript, fix this recipe once in Settings and every agent gets it.",
    command: "",
  },
  {
    cli: GENERIC_RECIPE_CLI,
    label: "Any other CLI",
    yields: "no_tokens",
    instructions:
      "Look for your CLI's session transcript, usually a jsonl under a dot directory in your home, and total its per-message token counters grouped by model. If nothing on disk records them, estimate the tokens, turns and duration and set estimated: true: an estimate the card labels beats silence. Found the format? Write the command into Settings so the next agent on this CLI gets it in the briefing.",
    command: "",
  },
];

/** The recipes the board ships with, before any workspace edit. */
export function factoryUsageRecipes(): UsageRecipeRow[] {
  return SEED.map((recipe) => ({
    ...recipe,
    source: "seed" as const,
    updatedBy: null,
    updatedAt: null,
  }));
}

/**
 * The recipe for a CLI, falling back to the generic one. `cli` is expected to
 * be a catalog id already: the caller resolves the name an agent sends
 * ("claude") to the id the board stores ("claude-code").
 */
export function findUsageRecipe<T extends UsageRecipe>(
  recipes: readonly T[],
  cli: string | null | undefined,
): T | null {
  const key = (cli ?? "").trim().toLowerCase();
  const exact = key
    ? recipes.find((recipe) => recipe.cli.toLowerCase() === key)
    : undefined;
  return (
    exact ?? recipes.find((recipe) => recipe.cli === GENERIC_RECIPE_CLI) ?? null
  );
}
