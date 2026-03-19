// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { GameplayView } from "./GameplayView";

const renderBattlefieldMock = vi.fn();

vi.mock("../../lib/renderer/battlefield-renderer", () => ({
  renderBattlefield: (...args: unknown[]) => renderBattlefieldMock(...args)
}));

function createGameView(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
  const baseView: PlayerGameView = {
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
      hand: [],
      handCount: 0
    },
    opponent: {
      id: "player-2",
      life: 18,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 2
    },
    zones: [],
    objectPool: {
      alpha: {
        id: "alpha",
        zcc: 1,
        cardDefId: "card-alpha",
        owner: "player-1",
        controller: "player-1",
        counters: {},
        damage: 0,
        tapped: false,
        summoningSick: false,
        attachments: [],
        zone: { kind: "battlefield", scope: "shared" }
      },
      beta: {
        id: "beta",
        zcc: 1,
        cardDefId: "card-beta",
        owner: "player-2",
        controller: "player-2",
        counters: {},
        damage: 0,
        tapped: true,
        summoningSick: false,
        attachments: [],
        zone: { kind: "battlefield", scope: "shared" }
      },
      handCard: {
        id: "hand-card",
        zcc: 1,
        cardDefId: "card-hand",
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
    stack: [],
    pendingChoice: null,
    legalActions: {
      passPriority: null,
      concede: { command: { type: "CONCEDE" } },
      choice: null,
      hand: {},
      battlefield: {
        alpha: [
          {
            type: "ACTIVATE_ABILITY",
            commandBase: { type: "ACTIVATE_ABILITY", sourceId: "alpha", abilityIndex: 0 },
            requiresTargets: false,
            isManaAbility: false,
            manaProduced: null,
            blocksAutoPass: true
          }
        ]
      }
    }
  };

  return {
    ...baseView,
    ...overrides,
    legalActions: overrides.legalActions ?? baseView.legalActions
  };
}

describe("GameplayView canvas integration", () => {
  class MockResizeObserver {
    static instances: MockResizeObserver[] = [];

    callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      MockResizeObserver.instances.push(this);
    }

    observe() {}
    disconnect() {}

    trigger(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
  }

  let container: HTMLDivElement;
  let root: Root;
  let rafCallbacks: FrameRequestCallback[];
  let rafIds = 0;
  const cancelAnimationFrameMock = vi.fn();

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    renderBattlefieldMock.mockReset();
    cancelAnimationFrameMock.mockReset();
    MockResizeObserver.instances = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setupAnimationFrameMocks() {
    rafCallbacks = [];
    rafIds = 0;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      rafIds += 1;
      return rafIds;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);
  }

  function renderView(gameView: PlayerGameView | null) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={gameView}
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
  }

  it("schedules battlefield rendering through requestAnimationFrame with battlefield objects only", () => {
    setupAnimationFrameMocks();
    renderView(createGameView());

    act(() => {
      rafCallbacks[0]?.(0);
    });

    expect(renderBattlefieldMock).toHaveBeenCalledTimes(1);
    expect(renderBattlefieldMock.mock.calls[0]?.[1]).toHaveLength(2);
  });

  it("requests a redraw when the canvas host resizes", () => {
    setupAnimationFrameMocks();
    renderView(createGameView());

    const host = container.querySelector("div > div") as HTMLDivElement;
    MockResizeObserver.instances[0]?.trigger(host);

    expect(rafCallbacks).toHaveLength(2);
  });

  it("cancels a pending animation frame on unmount", () => {
    setupAnimationFrameMocks();
    renderView(createGameView());

    act(() => {
      root.unmount();
    });

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
  });

  it("requests a new animation frame when the game view changes", () => {
    setupAnimationFrameMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <GameplayView
          gameView={createGameView({ stateVersion: 2 })}
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

    const initialFrameCount = rafCallbacks.length;

    act(() => {
      root.render(
        <GameplayView
          gameView={createGameView({ stateVersion: 3 })}
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

    expect(rafCallbacks.length).toBe(initialFrameCount + 1);
  });
});
