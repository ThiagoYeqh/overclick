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
  skills: string[];
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
  skills?: string[];
  agents?: string[];
};

export type Harness = {
  model: string | null;
  effort: EffortLevel;
  skills: string[];
  agent?: string;
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
  explicit?: {
    model: string;
    effort: EffortLevel;
    skills: string[];
    agent?: string;
  };
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
    skills: ["qa-fix-protocol"],
  },
  feature: {
    model_tier: "mid",
    effort: "medium",
    skills: ["ui-ux-pro-max"],
  },
  rfc: {
    model_tier: "top",
    effort: "high",
    skills: [],
  },
  architecture: {
    model_tier: "top",
    effort: "high",
    skills: [],
  },
  mechanical: {
    model_tier: "cheap",
    effort: "low",
    skills: [],
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

export function recommendHarness(
  input: RecommendInput,
): Result<RecommendResult> {
  const cardapio = input.cardapio ?? DEFAULT_CARDAPIO;
  const catalog = input.catalog ?? DEFAULT_MODEL_CATALOG;
  const entry = cardapio[input.type];
  if (!entry) {
    return err(
      "INVALID_ARGUMENT",
      `Tipo de task desconhecido para o cardápio: ${String(input.type)}`,
    );
  }

  if (input.explicit) {
    const matched = findByModelName(input.executors, input.explicit.model);
    const available = matched !== null;
    return ok({
      harness: {
        model: input.explicit.model,
        effort: input.explicit.effort,
        skills: [...input.explicit.skills],
        ...(input.explicit.agent ? { agent: input.explicit.agent } : {}),
      },
      model_tier: resolveModelTier(input.explicit.model, catalog) ?? entry.model_tier,
      available,
      source: "explicit",
      matched_executor: matched,
      ...(available
        ? {}
        : {
            divergence: `Modelo explícito '${input.explicit.model}' não está nos executores configurados.`,
          }),
    });
  }

  const matched = findByTier(input.executors, entry.model_tier, catalog);
  return ok({
    harness: {
      model: matched?.model ?? null,
      effort: entry.effort,
      skills: [...entry.skills],
    },
    model_tier: entry.model_tier,
    available: matched !== null,
    source: "cardapio",
    matched_executor: matched,
  });
}
