// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameplayPendingChoice, PlayerGameView } from "@forgetful-fish/realtime-contract";

import { GameplayView } from "./GameplayView";

vi.mock("../../lib/renderer/battlefield-renderer", () => ({
  renderBattlefield: vi.fn()
}));

function createGameView(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
  return {
    viewerPlayerId: "player-1",
    stateVersion: 2,
    turnState: {
      phase: "MAIN_1",
      activePlayerId: "player-1",
      priorityPlayerId: "player-2"
    },
    viewer: {
      id: "player-1",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [
        {
          id: "obj-1",
          zcc: 0,
          cardDefId: "island",
          owner: "player-1",
          controller: "player-1",
          counters: {},
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "hand", scope: "player", playerId: "player-1" }
        },
        {
          id: "obj-2",
          zcc: 0,
          cardDefId: "brainstorm",
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
      handCount: 2
    },
    opponent: {
      id: "player-2",
      life: 18,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 2
    },
    zones: [
      { zoneRef: { kind: "hand", scope: "player", playerId: "player-1" }, count: 0, objectIds: [] },
      { zoneRef: { kind: "hand", scope: "player", playerId: "player-2" }, count: 2 },
      { zoneRef: { kind: "battlefield", scope: "shared" }, count: 3, objectIds: ["a", "b", "c"] }
    ],
    objectPool: {
      "stack-obj-1": {
        id: "stack-obj-1",
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
      }
    },
    stack: [{ object: { id: "stack-obj-1", zcc: 0 }, controller: "player-2" }],
    pendingChoice: null,
    ...overrides
  };
}

function createPendingChoice(
  overrides: Partial<GameplayPendingChoice> = {}
): GameplayPendingChoice {
  return {
    id: "choice-1",
    type: "CHOOSE_YES_NO",
    forPlayer: "player-1",
    prompt: "Resolve the spell?",
    constraints: {},
    ...overrides
  };
}

describe("GameplayView", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders all gameplay panels and a live canvas host", () => {
    const html = renderToStaticMarkup(
      <GameplayView
        gameView={createGameView({ pendingChoice: createPendingChoice() })}
        recentEvents={[
          { seq: 7, eventType: "PRIORITY_PASSED" },
          { seq: 8, eventType: "STACK_ITEM_RESOLVED" }
        ]}
        pendingChoice={createPendingChoice()}
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

    expect(html).toContain("Status");
    expect(html).toContain("Commands");
    expect(html).toContain("Hand");
    expect(html).toContain("Stack");
    expect(html).toContain("Play land");
    expect(html).toContain("Cast spell");
    expect(html).toContain("brainstorm (stack-obj-1)");
    expect(html).toContain("Zones");
    expect(html).toContain("Events");
    expect(html).toContain("<canvas");
  });

  it("falls back to the waiting placeholder when gameView is missing", () => {
    const html = renderToStaticMarkup(
      <GameplayView
        gameView={null}
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

    expect(html).toContain("Waiting for projected game state...");
    expect(html).not.toContain("Status");
    expect(html).not.toContain("Commands");
  });

  it("disables pass priority when the opponent has priority", () => {
    const onPassPriority = vi.fn();

    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "ResizeObserver",
      class MockResizeObserver {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={createGameView({
            turnState: {
              phase: "MAIN_1",
              activePlayerId: "player-1",
              priorityPlayerId: "player-2"
            }
          })}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={onPassPriority}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const passPriorityButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Pass priority"
    );

    expect(passPriorityButton).toBeInstanceOf(HTMLButtonElement);
    expect((passPriorityButton as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      (passPriorityButton as HTMLButtonElement).click();
    });

    expect(onPassPriority).not.toHaveBeenCalled();
  });

  it("disables play and cast actions when the opponent has priority", () => {
    const onPlayLand = vi.fn();
    const onCastSpell = vi.fn();

    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "ResizeObserver",
      class MockResizeObserver {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={createGameView({
            turnState: {
              phase: "MAIN_1",
              activePlayerId: "player-1",
              priorityPlayerId: "player-2"
            }
          })}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={onPlayLand}
          onCastSpell={onCastSpell}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const playLandButton = container.querySelector(
      '[data-testid="play-land-obj-1"]'
    ) as HTMLButtonElement | null;
    const castSpellButton = container.querySelector(
      '[data-testid="cast-spell-obj-2"]'
    ) as HTMLButtonElement | null;

    expect(playLandButton).toBeInstanceOf(HTMLButtonElement);
    expect(castSpellButton).toBeInstanceOf(HTMLButtonElement);
    expect((playLandButton as HTMLButtonElement).disabled).toBe(true);
    expect((castSpellButton as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      (playLandButton as HTMLButtonElement).click();
      (castSpellButton as HTMLButtonElement).click();
    });

    expect(onPlayLand).not.toHaveBeenCalled();
    expect(onCastSpell).not.toHaveBeenCalled();
  });
});
