// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { GameplayView } from "./GameplayView";

vi.mock("../../lib/renderer/battlefield-renderer", () => ({
  renderBattlefield: vi.fn()
}));

function createGameView(): PlayerGameView {
  return {
    viewerPlayerId: "player-1",
    stateVersion: 5,
    turnState: {
      phase: "MAIN_1",
      activePlayerId: "player-1",
      priorityPlayerId: "player-1"
    },
    viewer: {
      id: "player-1",
      life: 20,
      manaPool: { white: 0, blue: 2, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [
        {
          id: "obj-ml",
          zcc: 0,
          cardDefId: "memory-lapse",
          owner: "player-1",
          controller: "player-1",
          counters: {},
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "hand", scope: "player", playerId: "player-1" }
        }
      ],
      handCount: 1
    },
    opponent: {
      id: "player-2",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 1
    },
    zones: [{ zoneRef: { kind: "stack", scope: "shared" }, count: 1 }],
    objectPool: {
      "obj-stack": {
        id: "obj-stack",
        zcc: 0,
        cardDefId: "brainstorm",
        owner: "player-2",
        controller: "player-2",
        counters: {},
        damage: 0,
        tapped: false,
        summoningSick: false,
        attachments: [],
        zone: { kind: "stack", scope: "shared" }
      },
      "obj-ml": {
        id: "obj-ml",
        zcc: 0,
        cardDefId: "memory-lapse",
        owner: "player-1",
        controller: "player-1",
        counters: {},
        damage: 0,
        tapped: false,
        summoningSick: false,
        attachments: [],
        zone: { kind: "hand", scope: "player", playerId: "player-1" }
      }
    },
    stack: [{ object: { id: "obj-stack", zcc: 0 }, controller: "player-2" }],
    pendingChoice: null
  };
}

describe("GameplayView targeted casts", () => {
  class MockResizeObserver {
    observe() {}
    disconnect() {}
  }

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("enters target selection mode for memory-lapse", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={createGameView()}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const beginTargetButton = container.querySelector(
      '[data-testid="cast-spell-targeted-obj-ml"]'
    ) as HTMLButtonElement | null;
    expect(beginTargetButton).toBeTruthy();

    act(() => {
      beginTargetButton?.click();
    });

    expect(container.textContent).toContain("Select a stack spell for memory-lapse.");
  });

  it("submits CAST_SPELL with selected stack-object target", () => {
    const onCastSpell = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={createGameView()}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={onCastSpell}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const beginTargetButton = container.querySelector(
      '[data-testid="cast-spell-targeted-obj-ml"]'
    ) as HTMLButtonElement | null;
    act(() => {
      beginTargetButton?.click();
    });

    const targetButton = container.querySelector(
      '[data-testid="stack-target-obj-stack"]'
    ) as HTMLButtonElement | null;
    expect(targetButton).toBeTruthy();

    act(() => {
      targetButton?.click();
    });

    expect(onCastSpell).toHaveBeenCalledWith("obj-ml", [
      {
        kind: "object",
        object: {
          id: "obj-stack",
          zcc: 0
        }
      }
    ]);
  });

  it("cancels target mode without submitting", () => {
    const onCastSpell = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={createGameView()}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={onCastSpell}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const beginTargetButton = container.querySelector(
      '[data-testid="cast-spell-targeted-obj-ml"]'
    ) as HTMLButtonElement | null;
    act(() => {
      beginTargetButton?.click();
    });

    const cancelButton = container.querySelector(
      '[data-testid="cancel-target-selection"]'
    ) as HTMLButtonElement | null;
    expect(cancelButton).toBeTruthy();

    act(() => {
      cancelButton?.click();
    });

    expect(onCastSpell).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Select a stack spell for memory-lapse.");
  });

  it("exits target mode when the targeting card leaves hand before selection", () => {
    const onCastSpell = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const initialView = createGameView();
    act(() => {
      root.render(
        <GameplayView
          gameView={initialView}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={onCastSpell}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const beginTargetButton = container.querySelector(
      '[data-testid="cast-spell-targeted-obj-ml"]'
    ) as HTMLButtonElement | null;
    act(() => {
      beginTargetButton?.click();
    });

    const stackObject = initialView.objectPool["obj-stack"];
    if (!stackObject) {
      throw new Error("missing obj-stack test fixture");
    }

    const updatedView: PlayerGameView = {
      ...initialView,
      stateVersion: 6,
      viewer: {
        ...initialView.viewer,
        hand: [],
        handCount: 0
      },
      objectPool: {
        "obj-stack": stackObject
      }
    };

    act(() => {
      root.render(
        <GameplayView
          gameView={updatedView}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={onCastSpell}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    expect(onCastSpell).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Select a stack spell for memory-lapse.");
    expect(container.querySelector('[data-testid="stack-target-obj-stack"]')).toBeNull();
  });

  it("does not enter target selection when the opponent has priority", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={{
            ...createGameView(),
            turnState: {
              phase: "MAIN_1",
              activePlayerId: "player-1",
              priorityPlayerId: "player-2"
            }
          }}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const beginTargetButton = container.querySelector(
      '[data-testid="cast-spell-targeted-obj-ml"]'
    ) as HTMLButtonElement | null;

    expect(beginTargetButton).toBeTruthy();
    expect((beginTargetButton as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      beginTargetButton?.click();
    });

    expect(container.textContent).not.toContain("Select a stack spell for memory-lapse.");
  });

  it("does not submit a target after priority changes to the opponent", () => {
    const onCastSpell = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const initialView = createGameView();
    act(() => {
      root.render(
        <GameplayView
          gameView={initialView}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={onCastSpell}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const beginTargetButton = container.querySelector(
      '[data-testid="cast-spell-targeted-obj-ml"]'
    ) as HTMLButtonElement | null;
    act(() => {
      beginTargetButton?.click();
    });

    act(() => {
      root.render(
        <GameplayView
          gameView={{
            ...initialView,
            stateVersion: 6,
            turnState: {
              phase: "MAIN_1",
              activePlayerId: "player-1",
              priorityPlayerId: "player-2"
            }
          }}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={onCastSpell}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const targetButton = container.querySelector(
      '[data-testid="stack-target-obj-stack"]'
    ) as HTMLButtonElement | null;

    expect(targetButton).toBeTruthy();
    expect((targetButton as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      targetButton?.click();
    });

    expect(onCastSpell).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Select a stack spell for memory-lapse.");
  });
});
