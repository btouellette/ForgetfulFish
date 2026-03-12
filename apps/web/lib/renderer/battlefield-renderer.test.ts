import { describe, expect, it } from "vitest";
import type { GameObjectView } from "@forgetful-fish/game-engine";

import { renderBattlefield } from "./battlefield-renderer";

function createObject(overrides: Partial<GameObjectView> = {}): GameObjectView {
  return {
    id: "object-1",
    zcc: 1,
    cardDefId: "card-1",
    owner: "player-1",
    controller: "player-1",
    counters: {},
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    zone: { kind: "battlefield", scope: "shared" },
    ...overrides
  };
}

function createContextRecorder() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    save() {
      calls.push({ method: "save", args: [] });
    },
    restore() {
      calls.push({ method: "restore", args: [] });
    },
    clearRect(...args: unknown[]) {
      calls.push({ method: "clearRect", args });
    },
    fillRect(...args: unknown[]) {
      calls.push({ method: "fillRect", args });
    },
    strokeRect(...args: unknown[]) {
      calls.push({ method: "strokeRect", args });
    },
    fillText(...args: unknown[]) {
      calls.push({ method: "fillText", args });
    },
    translate(...args: unknown[]) {
      calls.push({ method: "translate", args });
    },
    rotate(...args: unknown[]) {
      calls.push({ method: "rotate", args });
    }
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("renderBattlefield", () => {
  it("renders an empty battlefield placeholder", () => {
    const { ctx, calls } = createContextRecorder();

    renderBattlefield(ctx, [], 800, 450, "player-1");

    expect(calls.some((call) => call.method === "clearRect")).toBe(true);
    expect(
      calls.some((call) => call.method === "fillText" && call.args[0] === "Battlefield empty")
    ).toBe(true);
  });

  it("renders labeled object rectangles for battlefield permanents", () => {
    const { ctx, calls } = createContextRecorder();

    renderBattlefield(
      ctx,
      [
        createObject({ id: "alpha", cardDefId: "card-alpha", controller: "player-1" }),
        createObject({ id: "beta", cardDefId: "card-beta", controller: "player-2" })
      ],
      800,
      450,
      "player-1"
    );

    expect(calls.filter((call) => call.method === "fillRect").length).toBeGreaterThanOrEqual(2);
    expect(
      calls.some(
        (call) => call.method === "fillText" && String(call.args[0]).includes("card-alpha")
      )
    ).toBe(true);
    expect(
      calls.some((call) => call.method === "fillText" && String(call.args[0]).includes("card-beta"))
    ).toBe(true);
  });

  it("applies tapped and owner-distinction visuals", () => {
    const { ctx, calls } = createContextRecorder();

    renderBattlefield(
      ctx,
      [
        createObject({
          id: "tapped",
          tapped: true,
          controller: "player-1",
          cardDefId: "card-tapped"
        }),
        createObject({
          id: "opponent",
          tapped: false,
          controller: "player-2",
          cardDefId: "card-opponent"
        })
      ],
      800,
      450,
      "player-1"
    );

    expect(calls.some((call) => call.method === "rotate")).toBe(true);
    expect(
      calls.some((call) => call.method === "fillText" && String(call.args[0]).includes("You"))
    ).toBe(true);
    expect(
      calls.some((call) => call.method === "fillText" && String(call.args[0]).includes("Opponent"))
    ).toBe(true);
  });
});
