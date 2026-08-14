type Usage = {
  costUsd?: number | string | null;
  durationMs?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  tokensCache?: number | null;
};

type InsightTask = {
  telemetryIncomplete: boolean;
  attempts: Usage[];
  handoffs: Array<{ attemptId: string | null; usage?: Usage | null }>;
};

export type InsightsSummary = {
  totalCostUsd: number;
  totalTokens: number;
  totalDurationMs: number;
  incompleteTelemetryCount: number;
};

function numberOrZero(value: number | string | null | undefined): number {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numberValue) ? (numberValue ?? 0) : 0;
}

function addUsage(summary: InsightsSummary, usage: Usage): void {
  summary.totalCostUsd += numberOrZero(usage.costUsd);
  summary.totalDurationMs += numberOrZero(usage.durationMs);
  summary.totalTokens +=
    numberOrZero(usage.tokensIn) +
    numberOrZero(usage.tokensOut) +
    numberOrZero(usage.tokensCache);
}

export function aggregateInsights(tasks: InsightTask[]): InsightsSummary {
  const summary: InsightsSummary = {
    totalCostUsd: 0,
    totalTokens: 0,
    totalDurationMs: 0,
    incompleteTelemetryCount: 0,
  };

  for (const task of tasks) {
    if (task.telemetryIncomplete) summary.incompleteTelemetryCount += 1;
    for (const attempt of task.attempts) addUsage(summary, attempt);
    for (const handoff of task.handoffs) {
      if (handoff.attemptId === null && handoff.usage) addUsage(summary, handoff.usage);
    }
  }

  return summary;
}
