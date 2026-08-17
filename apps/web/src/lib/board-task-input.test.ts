import { describe, expect, it } from "vitest";
import { parseBoardTaskInput } from "./board-task-input";

describe("parseBoardTaskInput", () => {
  it("trims and normalizes valid board card input", () => {
    const result = parseBoardTaskInput({
      title: "  Add audit log  ",
      type: "feature",
      priority: "alta",
      what: "  Create an audit log.  ",
      why: "  Operators need traceability.  ",
      howToConfirm: "  Create a card and see the event.  ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "Add audit log",
        type: "feature",
        priority: "alta",
        oQue: "Create an audit log.",
        porQue: "Operators need traceability.",
        comoConfirmo: [
          {
            step: "Create a card and see the event.",
            expected: "Passes as described.",
          },
        ],
      },
    });
  });

  it("rejects missing required fields", () => {
    const result = parseBoardTaskInput({
      title: " ",
      type: "feature",
      priority: "media",
      what: "Build it",
      why: "Needed",
      howToConfirm: "Check it",
    });

    expect(result).toEqual({ ok: false, error: "Title is required." });
  });

  it("rejects titles longer than 200 characters", () => {
    const result = parseBoardTaskInput({
      title: "x".repeat(201),
      type: "feature",
      priority: "media",
      what: "Build it",
      why: "Needed",
      howToConfirm: "Check it",
    });

    expect(result).toEqual({
      ok: false,
      error: "Title must be 200 characters or fewer.",
    });
  });

  it("rejects invalid type and priority values", () => {
    expect(
      parseBoardTaskInput({
        title: "A",
        type: "chore",
        priority: "media",
        what: "Build it",
        why: "Needed",
        howToConfirm: "Check it",
      }),
    ).toEqual({ ok: false, error: "Choose a valid type." });

    expect(
      parseBoardTaskInput({
        title: "A",
        type: "feature",
        priority: "critical",
        what: "Build it",
        why: "Needed",
        howToConfirm: "Check it",
      }),
    ).toEqual({ ok: false, error: "Choose a valid priority." });
  });
});
