export type Effort = "low" | "medium" | "high";

export type Harness = {
  cli?: string | null;
  model: string | null;
  effort: Effort | null;
  modelTier?: "cheap" | "mid" | "top";
};

export type CardapioPolicyEntry = {
  type: string;
  cli: string | null;
  model: string | null;
  effort: Effort;
};

export type ExecutorConfig = {
  id: string;
  label: string;
  enabled: boolean;
  models: string[];
  /**
   * Editable model list for this CLI. The built-in catalog is only the initial
   * suggestion; users add and remove models as free text. Absent on configs
   * saved before this field existed.
   */
  catalog?: string[];
};

export type Cardapio = {
  feature: Harness;
  bug: Harness;
  rfc: Harness;
};

export type TaskOrigin = {
  paneId?: string;
  sessionId?: string;
  agent?: string;
  cli?: string;
};

export type HandoffEvidence = {
  kind: "text" | "link";
  value: string;
};

export type HandoffArtifact = {
  name: string;
  mime?: string;
  content: string;
};

export type UsageReport = {
  tokensIn?: number;
  tokensOut?: number;
  tokensCache?: number;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
};

/** One ticked How-to-confirm step during human validation of a done card. */
export type ValidationTick = {
  index: number;
  byUserId: string;
  byEmail: string;
  at: string;
};

export type TaskType = "feature" | "bug" | "rfc";
export type TaskPriority = "urgente" | "alta" | "media" | "baixa";
export type ReviewerKind = "human" | "agent" | "workspace_queue";
export type ExecutionMode = "solo" | "team";
export type MissionStatus = "ativa" | "pausada" | "concluida";
