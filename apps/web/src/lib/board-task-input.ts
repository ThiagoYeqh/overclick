import type { ConfirmationStep } from "@agent-board/mcp-core";

const TYPES = ["feature", "bug", "rfc"] as const;
const PRIORITIES = ["urgente", "alta", "media", "baixa"] as const;

export type BoardTaskType = (typeof TYPES)[number];
export type BoardTaskPriority = (typeof PRIORITIES)[number];

export type BoardTaskInput = {
  title: string;
  type: BoardTaskType;
  priority: BoardTaskPriority;
  oQue: string;
  porQue: string;
  comoConfirmo: ConfirmationStep[];
};

export type BoardTaskInputResult =
  | { ok: true; value: BoardTaskInput }
  | { ok: false; error: string };

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function isType(value: string): value is BoardTaskType {
  return (TYPES as readonly string[]).includes(value);
}

function isPriority(value: string): value is BoardTaskPriority {
  return (PRIORITIES as readonly string[]).includes(value);
}

export function parseBoardTaskInput(input: unknown): BoardTaskInputResult {
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const title = stringField(record, "title");
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > 200) {
    return { ok: false, error: "Title must be 200 characters or fewer." };
  }

  const type = stringField(record, "type");
  if (!isType(type)) return { ok: false, error: "Choose a valid type." };

  const priority = stringField(record, "priority");
  if (!isPriority(priority)) {
    return { ok: false, error: "Choose a valid priority." };
  }

  const oQue = stringField(record, "what");
  if (!oQue) return { ok: false, error: "What is required." };

  const porQue = stringField(record, "why");
  if (!porQue) return { ok: false, error: "Why is required." };

  const howToConfirm = stringField(record, "howToConfirm");
  if (!howToConfirm) {
    return { ok: false, error: "How to confirm is required." };
  }

  return {
    ok: true,
    value: {
      title,
      type,
      priority,
      oQue,
      porQue,
      comoConfirmo: [
        {
          step: howToConfirm,
          expected: "Passes as described.",
        },
      ],
    },
  };
}
