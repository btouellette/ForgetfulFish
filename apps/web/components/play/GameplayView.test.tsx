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
    legalActions: {
      passPriority: null,
      concede: { command: { type: "CONCEDE" } },
      choice: null,
      hand: {
        "obj-1": [{ type: "PLAY_LAND", command: { type: "PLAY_LAND", cardId: "obj-1" } }],
        "obj-2": [
          {
            type: "CAST_SPELL",
            commandBase: { type: "CAST_SPELL", cardId: "obj-2" },
            requiresTargets: false,
            availableModes: []
          }
        ]
      },
      battlefield: {},
      hasOtherBlockingActions: false
    }
  };

  return {
    ...baseView,
    ...overrides,
    legalActions: overrides.legalActions ?? baseView.legalActions
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

  function installLocalStorageMock(overrides: Partial<Storage> = {}) {
    const storageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
      ...overrides
    } satisfies Storage;

    vi.stubGlobal("localStorage", storageMock);

    return storageMock;
  }

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
        gameView={createGameView({
          pendingChoice: createPendingChoice(),
          legalActions: {
            passPriority: null,
            concede: { command: { type: "CONCEDE" } },
            choice: null,
            hand: {
              "obj-1": [{ type: "PLAY_LAND", command: { type: "PLAY_LAND", cardId: "obj-1" } }],
              "obj-2": [
                {
                  type: "CAST_SPELL",
                  commandBase: { type: "CAST_SPELL", cardId: "obj-2" },
                  requiresTargets: false,
                  availableModes: []
                }
              ]
            },
            battlefield: {
              island: [
                {
                  type: "ACTIVATE_ABILITY",
                  commandBase: { type: "ACTIVATE_ABILITY", sourceId: "island", abilityIndex: 0 },
                  requiresTargets: false,
                  isManaAbility: true,
                  manaProduced: { blue: 1 },
                  blocksAutoPass: true
                }
              ]
            },
            hasOtherBlockingActions: false
          },
          objectPool: {
            ...createGameView().objectPool,
            island: {
              id: "island",
              zcc: 0,
              cardDefId: "island",
              owner: "player-1",
              controller: "player-1",
              counters: {},
              damage: 0,
              tapped: false,
              summoningSick: false,
              attachments: [],
              zone: { kind: "battlefield", scope: "shared" }
            }
          }
        })}
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
        onActivateAbility={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Status");
    expect(html).toContain("Commands");
    expect(html).toContain("Hand");
    expect(html).toContain("Battlefield actions");
    expect(html).toContain("Stack");
    expect(html).toContain("Play land");
    expect(html).toContain("Cast spell");
    expect(html).toContain("brainstorm (stack-obj-1)");
    expect(html).toContain("Zones");
    expect(html).toContain("Events");
    expect(html).toContain("<canvas");
  });

  it("submits battlefield activation intent from projected legal actions", () => {
    const onActivateAbility = vi.fn();

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
              priorityPlayerId: "player-1"
            },
            objectPool: {
              ...createGameView().objectPool,
              island: {
                id: "island",
                zcc: 0,
                cardDefId: "island",
                owner: "player-1",
                controller: "player-1",
                counters: {},
                damage: 0,
                tapped: false,
                summoningSick: false,
                attachments: [],
                zone: { kind: "battlefield", scope: "shared" }
              }
            },
            legalActions: {
              passPriority: { command: { type: "PASS_PRIORITY" } },
              concede: { command: { type: "CONCEDE" } },
              choice: null,
              hand: {},
              battlefield: {
                island: [
                  {
                    type: "ACTIVATE_ABILITY",
                    commandBase: { type: "ACTIVATE_ABILITY", sourceId: "island", abilityIndex: 0 },
                    requiresTargets: false,
                    isManaAbility: true,
                    manaProduced: { blue: 1 },
                    blocksAutoPass: true
                  }
                ]
              },
              hasOtherBlockingActions: false
            }
          })}
          recentEvents={[]}
          pendingChoice={null}
          isSubmittingCommand={false}
          error={null}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onActivateAbility={onActivateAbility}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const activateButton = container.querySelector(
      '[data-testid="activate-ability-island-0"]'
    ) as HTMLButtonElement | null;

    expect(activateButton).toBeTruthy();

    act(() => {
      activateButton?.click();
    });

    expect(onActivateAbility).toHaveBeenCalledWith("island", 0);
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

  it("auto-passes once per state version when enabled and no apparent actions exist", () => {
    const onPassPriority = vi.fn();
    installLocalStorageMock();

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

    const initialGameView = createGameView({
      stateVersion: 7,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-1"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        handCount: 0
      },
      objectPool: {},
      stack: [],
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    act(() => {
      root.render(
        <GameplayView
          gameView={initialGameView}
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

    const checkbox = container.querySelector(
      '[data-testid="auto-pass-checkbox"]'
    ) as HTMLInputElement | null;

    act(() => {
      checkbox?.click();
    });

    expect(onPassPriority).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <GameplayView
          gameView={initialGameView}
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

    expect(onPassPriority).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <GameplayView
          gameView={{ ...initialGameView, stateVersion: 8 }}
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

    expect(onPassPriority).toHaveBeenCalledTimes(2);
  });

  it("resets auto-pass dedupe when state version sequence restarts", () => {
    const onPassPriority = vi.fn();
    installLocalStorageMock();

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

    const gameView = createGameView({
      stateVersion: 5,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-1"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        handCount: 0
      },
      objectPool: {},
      stack: [],
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    act(() => {
      root.render(
        <GameplayView
          gameView={gameView}
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

    const checkbox = container.querySelector(
      '[data-testid="auto-pass-checkbox"]'
    ) as HTMLInputElement | null;

    act(() => {
      checkbox?.click();
    });

    expect(onPassPriority).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <GameplayView
          gameView={{ ...gameView, stateVersion: 1 }}
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

    expect(onPassPriority).toHaveBeenCalledTimes(2);
  });

  it("does not auto-pass when an Island would enable a visible spell", () => {
    const onPassPriority = vi.fn();
    installLocalStorageMock();

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

    const gameView = createGameView({
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-1"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [
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
        handCount: 1
      },
      objectPool: {
        island: {
          id: "island",
          zcc: 0,
          cardDefId: "island",
          owner: "player-1",
          controller: "player-1",
          counters: {},
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "battlefield", scope: "shared" }
        }
      },
      stack: [],
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {
          "obj-2": [
            {
              type: "CAST_SPELL",
              commandBase: { type: "CAST_SPELL", cardId: "obj-2" },
              requiresTargets: false,
              availableModes: []
            }
          ]
        },
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    act(() => {
      root.render(
        <GameplayView
          gameView={gameView}
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

    const checkbox = container.querySelector(
      '[data-testid="auto-pass-checkbox"]'
    ) as HTMLInputElement | null;

    act(() => {
      checkbox?.click();
    });

    expect(onPassPriority).not.toHaveBeenCalled();
  });

  it("auto-passes when the only visible action is a land outside a land-play window", () => {
    const onPassPriority = vi.fn();
    installLocalStorageMock();

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

    const gameView = createGameView({
      turnState: {
        phase: "UPKEEP",
        activePlayerId: "player-1",
        priorityPlayerId: "player-1"
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
          }
        ],
        handCount: 1
      },
      objectPool: {},
      stack: [],
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    act(() => {
      root.render(
        <GameplayView
          gameView={gameView}
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

    const checkbox = container.querySelector(
      '[data-testid="auto-pass-checkbox"]'
    ) as HTMLInputElement | null;

    act(() => {
      checkbox?.click();
    });

    expect(onPassPriority).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "Auto-pass will pass priority automatically on this state."
    );
  });

  it("restores the saved auto-pass preference from localStorage on mount", () => {
    installLocalStorageMock({ getItem: vi.fn(() => "true") });

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
              priorityPlayerId: "player-1"
            },
            viewer: {
              id: "player-1",
              life: 20,
              manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
              hand: [],
              handCount: 0
            },
            objectPool: {},
            stack: [],
            legalActions: {
              passPriority: { command: { type: "PASS_PRIORITY" } },
              concede: { command: { type: "CONCEDE" } },
              choice: null,
              hand: {},
              battlefield: {},
              hasOtherBlockingActions: false
            }
          })}
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

    const checkbox = container.querySelector(
      '[data-testid="auto-pass-checkbox"]'
    ) as HTMLInputElement | null;

    expect(checkbox?.checked).toBe(true);
  });

  it("persists the auto-pass preference when the checkbox is toggled", () => {
    const localStorageMock = installLocalStorageMock();

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
              priorityPlayerId: "player-1"
            },
            viewer: {
              id: "player-1",
              life: 20,
              manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
              hand: [],
              handCount: 0
            },
            objectPool: {},
            stack: [],
            legalActions: {
              passPriority: { command: { type: "PASS_PRIORITY" } },
              concede: { command: { type: "CONCEDE" } },
              choice: null,
              hand: {},
              battlefield: {},
              hasOtherBlockingActions: false
            }
          })}
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

    const checkbox = container.querySelector(
      '[data-testid="auto-pass-checkbox"]'
    ) as HTMLInputElement | null;

    act(() => {
      checkbox?.click();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith("ff:autoPassEnabled", "true");
  });
});
