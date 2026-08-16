import { err, ok, type Result } from "../errors.js";

export const MODEL_TIERS = ["top", "mid", "cheap"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const CARDAPIO_TASK_TYPES = [
  "bug",
  "feature",
  "rfc",
  "architecture",
  "mechanical",
] as const;
export type CardapioTaskType = (typeof CARDAPIO_TASK_TYPES)[number];

export type CardapioEntry = {
  model_tier: ModelTier;
  effort: EffortLevel;
};

export type Cardapio = Record<CardapioTaskType, CardapioEntry>;

export type ModelInfo = {
  id: string;
  tier: ModelTier;
  aliases?: readonly string[];
};

export type ConfiguredExecutor = {
  id: string;
  cli: string;
  models: string[];
  agents?: string[];
};

export type Harness = {
  cli: string | null;
  model: string | null;
  effort: EffortLevel;
};

export type MatchedExecutor = {
  id: string;
  cli: string;
  model: string;
};

export type RecommendInput = {
  type: CardapioTaskType;
  executors: readonly ConfiguredExecutor[];
  cardapio?: Cardapio;
  catalog?: readonly ModelInfo[];
  /** Stored workspace policy. When set, recommend is a lookup (factory fallback). */
  policy?: readonly CardapioPolicyEntry[];
  explicit?: {
    cli?: string;
    model: string;
    effort: EffortLevel;
  };
};

/** One declared row of the workspace cardapio: activity type → CLI · model · effort. */
export type CardapioPolicyEntry = {
  type: string;
  cli: string | null;
  model: string | null;
  effort: EffortLevel;
};

export type RecommendResult = {
  harness: Harness;
  model_tier: ModelTier;
  available: boolean;
  source: "cardapio" | "explicit";
  matched_executor: MatchedExecutor | null;
  divergence?: string;
};

/**
 * Factory default distilled from the overclock-app B1–B6 matrix:
 * bug → mid; rfc/architecture → top · high; mechanical → cheap · low.
 */
export const DEFAULT_CARDAPIO: Cardapio = {
  bug: {
    model_tier: "mid",
    effort: "medium",
  },
  feature: {
    model_tier: "mid",
    effort: "medium",
  },
  rfc: {
    model_tier: "top",
    effort: "high",
  },
  architecture: {
    model_tier: "top",
    effort: "high",
  },
  mechanical: {
    model_tier: "cheap",
    effort: "low",
  },
};

export const DEFAULT_MODEL_CATALOG: readonly ModelInfo[] = [
  {
    id: "opus-4-8",
    tier: "top",
    aliases: ["opus", "claude-opus", "claude-opus-4"],
  },
  {
    id: "sonnet-5",
    tier: "mid",
    aliases: ["sonnet", "claude-sonnet", "claude-sonnet-5"],
  },
  {
    id: "haiku-4",
    tier: "cheap",
    aliases: ["haiku", "claude-haiku"],
  },
  { id: "gpt-5", tier: "top", aliases: ["gpt5"] },
  { id: "gpt-4.1", tier: "mid" },
  { id: "gpt-4.1-mini", tier: "cheap" },
  { id: "gemini-2.5-pro", tier: "top" },
  { id: "gemini-2.5-flash", tier: "cheap" },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveModelTier(
  modelName: string,
  catalog: readonly ModelInfo[] = DEFAULT_MODEL_CATALOG,
): ModelTier | null {
  const needle = normalize(modelName);
  for (const model of catalog) {
    if (normalize(model.id) === needle) {
      return model.tier;
    }
    if (model.aliases?.some((alias) => normalize(alias) === needle)) {
      return model.tier;
    }
  }
  return null;
}

function findByTier(
  executors: readonly ConfiguredExecutor[],
  tier: ModelTier,
  catalog: readonly ModelInfo[],
): MatchedExecutor | null {
  for (const executor of executors) {
    for (const model of executor.models) {
      if (resolveModelTier(model, catalog) === tier) {
        return { id: executor.id, cli: executor.cli, model };
      }
    }
  }
  return null;
}

function findByModelName(
  executors: readonly ConfiguredExecutor[],
  modelName: string,
): MatchedExecutor | null {
  const needle = normalize(modelName);
  for (const executor of executors) {
    for (const model of executor.models) {
      if (normalize(model) === needle) {
        return { id: executor.id, cli: executor.cli, model };
      }
    }
  }
  return null;
}

function catalogModelForTier(
  tier: ModelTier,
  catalog: readonly ModelInfo[] = DEFAULT_MODEL_CATALOG,
): string | null {
  return catalog.find((model) => model.tier === tier)?.id ?? null;
}

/**
 * Factory seed of the explicit policy table, distilled from DEFAULT_CARDAPIO × catalog.
 * CLI is null until the user picks an executor; model is the catalog id for that tier.
 */
export const FACTORY_CARDAPIO_POLICY: readonly CardapioPolicyEntry[] =
  CARDAPIO_TASK_TYPES.map((type) => {
    const entry = DEFAULT_CARDAPIO[type];
    return {
      type,
      cli: null,
      model: catalogModelForTier(entry.model_tier),
      effort: entry.effort,
    };
  });

export function lookupCardapioPolicy(
  policy: readonly CardapioPolicyEntry[] | null | undefined,
  type: string,
): CardapioPolicyEntry {
  const stored = policy?.find((row) => row.type === type);
  if (stored) {
    return { ...stored };
  }
  const factory = FACTORY_CARDAPIO_POLICY.find((row) => row.type === type);
  if (factory) {
    return { ...factory };
  }
  const fallback = DEFAULT_CARDAPIO[type as CardapioTaskType] ?? DEFAULT_CARDAPIO.feature;
  return {
    type,
    cli: null,
    model: catalogModelForTier(fallback.model_tier),
    effort: fallback.effort,
  };
}

function matchPolicyExecutor(
  executors: readonly ConfiguredExecutor[],
  entry: CardapioPolicyEntry,
): MatchedExecutor | null {
  if (!entry.model) return null;
  if (entry.cli) {
    const needleCli = normalize(entry.cli);
    for (const executor of executors) {
      if (normalize(executor.cli) !== needleCli && normalize(executor.id) !== needleCli) {
        continue;
      }
      const model = executor.models.find((name) => normalize(name) === normalize(entry.model!));
      if (model) {
        return { id: executor.id, cli: executor.cli, model };
      }
    }
  }
  return findByModelName(executors, entry.model);
}

export function recommendHarness(
  input: RecommendInput,
): Result<RecommendResult> {
  const catalog = input.catalog ?? DEFAULT_MODEL_CATALOG;

  if (input.explicit) {
    const matched = findByModelName(input.executors, input.explicit.model);
    const available = matched !== null;
    const tier =
      resolveModelTier(input.explicit.model, catalog) ??
      DEFAULT_CARDAPIO[input.type]?.model_tier ??
      "mid";
    return ok({
      harness: {
        cli: input.explicit.cli ?? matched?.cli ?? null,
        model: input.explicit.model,
        effort: input.explicit.effort,
      },
      model_tier: tier,
      available,
      source: "explicit",
      matched_executor: matched,
      ...(available
        ? {}
        : {
            divergence: `Explicit model '${input.explicit.model}' is not among the configured executors.`,
          }),
    });
  }

  if (input.policy) {
    const entry = lookupCardapioPolicy(input.policy, input.type);
    const matched = matchPolicyExecutor(input.executors, entry);
    const tier =
      (entry.model ? resolveModelTier(entry.model, catalog) : null) ??
      DEFAULT_CARDAPIO[input.type]?.model_tier ??
      "mid";
    return ok({
      harness: {
        cli: entry.cli,
        model: entry.model,
        effort: entry.effort,
      },
      model_tier: tier,
      available: Boolean(entry.model) && matched !== null,
      source: "cardapio",
      matched_executor: matched,
      ...(entry.model && !matched
        ? {
            divergence: `Policy model '${entry.model}' is not among the configured executors.`,
          }
        : {}),
    });
  }

  const cardapio = input.cardapio ?? DEFAULT_CARDAPIO;
  const entry = cardapio[input.type];
  if (!entry) {
    return err(
      "INVALID_ARGUMENT",
      `Unknown task type for the harness policy: ${String(input.type)}`,
    );
  }

  const matched = findByTier(input.executors, entry.model_tier, catalog);
  return ok({
    harness: {
      cli: matched?.cli ?? null,
      model: matched?.model ?? null,
      effort: entry.effort,
    },
    model_tier: entry.model_tier,
    available: matched !== null,
    source: "cardapio",
    matched_executor: matched,
  });
}
