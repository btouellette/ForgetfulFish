import { describe, expect, it } from "vitest";

import type { GameAction } from "../../src/actions/action";
import { advanceCursor, readFromScratch, writeToScratch } from "../../src/actions/whiteboard";
import type { EffectContext, Whiteboard } from "../../src/stack/stackItem";

function makeWhiteboard(actions: GameAction[] = []): Whiteboard {
  return {
    actions,
    scratch: {}
  };
}

function makeContext(cursor: EffectContext["cursor"], whiteboard: Whiteboard): EffectContext {
  return {
    stackItemId: "stack-1",
    source: { id: "obj-1", zcc: 0 },
    controller: "p1",
    targets: [],
    cursor,
    whiteboard
  };
}

describe("stack/stackItem", () => {
  it("advances cursor from start to step 0", () => {
    const context = makeContext({ kind: "start" }, makeWhiteboard());

    const next = advanceCursor(context);

    expect(next.cursor).toEqual({ kind: "step", index: 0 });
  });

  it("writes and reads whiteboard scratch values", () => {
    const context = makeContext({ kind: "start" }, makeWhiteboard());
    const withValue = writeToScratch(context, "namedCard", "Island");

    expect(readFromScratch<string>(withValue, "namedCard")).toBe("Island");
  });

  it("preserves whiteboard state while waiting for choice", () => {
    const drawAction: GameAction = {
      id: "action-1",
      type: "DRAW",
      source: null,
      controller: "p1",
      appliedReplacements: [],
      playerId: "p1",
      count: 1
    };
    const context = makeContext(
      { kind: "waiting_choice", choiceId: "choice-1" },
      makeWhiteboard([drawAction])
    );
    const withScratch = writeToScratch(context, "selected", ["obj-2", "obj-3"]);

    const next = advanceCursor(withScratch);

    expect(next).not.toBe(withScratch);
    expect(next.cursor).toEqual({ kind: "waiting_choice", choiceId: "choice-1" });
    expect(next.whiteboard.actions).toHaveLength(1);
    expect(readFromScratch<string[]>(next, "selected")).toEqual(["obj-2", "obj-3"]);
  });

  it("increments step index by one", () => {
    const context = makeContext({ kind: "step", index: 2 }, makeWhiteboard());

    const next = advanceCursor(context);

    expect(next.cursor).toEqual({ kind: "step", index: 3 });
  });

  it("supports whiteboard action storage", () => {
    const action: GameAction = {
      id: "action-2",
      type: "DRAW",
      source: null,
      controller: "p1",
      appliedReplacements: [],
      playerId: "p1",
      count: 2
    };
    const context = makeContext({ kind: "start" }, makeWhiteboard([action]));

    expect(context.whiteboard.actions[0]).toEqual(action);
  });

  it("stores and retrieves multiple scratch value types", () => {
    const context = makeContext({ kind: "start" }, makeWhiteboard());
    const withBoolean = writeToScratch(context, "accepted", true);
    const withNumber = writeToScratch(withBoolean, "index", 7);
    const withObject = writeToScratch(withNumber, "payload", {
      id: "choice-2",
      cards: ["obj-7"]
    });

    expect(readFromScratch<boolean>(withObject, "accepted")).toBe(true);
    expect(readFromScratch<number>(withObject, "index")).toBe(7);
    expect(readFromScratch<{ id: string; cards: string[] }>(withObject, "payload")).toEqual({
      id: "choice-2",
      cards: ["obj-7"]
    });
  });

  it("returns a new context object when cursor is done", () => {
    const context = makeContext({ kind: "done" }, makeWhiteboard());

    const next = advanceCursor(context);

    expect(next).not.toBe(context);
    expect(next.cursor).toEqual({ kind: "done" });
  });
});
