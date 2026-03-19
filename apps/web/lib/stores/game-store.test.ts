import { describe, expect, it, vi } from "vitest";
import type {
  GameplayCommand,
  GameplayPendingChoice,
  PlayerGameView
} from "@forgetful-fish/realtime-contract";

import type { GameSessionViewModel } from "../game-session-adapter";
import { ServerApiError } from "../server-api";
import { createGameStore } from "./game-store";

function createViewModel(overrides: Partial<GameSessionViewModel> = {}): GameSessionViewModel {
  return {
    roomId: "00000000-0000-4000-8000-000000000001",
    participants: [{ userId: "player-1", seat: "P1", ready: true }],
    gameId: null,
    gameStatus: "not_started",
    latestAppliedVersion: null,
    pendingChoice: null,
    lastEventType: null,
    ...overrides
  };
}

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
      manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [],
      handCount: 0
    },
    opponent: {
      id: "player-2",
      life: 19,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 0
    },
    zones: [{ zoneRef: { kind: "library", scope: "shared" }, count: 40 }],
    objectPool: {},
    stack: [],
    pendingChoice: null,
    legalActions: {
      passPriority: null,
      concede: { command: { type: "CONCEDE" } },
      choice: null,
      hand: {},
      battlefield: {}
    }
  };

  return {
    ...baseView,
    ...overrides,
    legalActions: overrides.legalActions ?? baseView.legalActions
  };
}

function createPendingChoice(): GameplayPendingChoice {
  return {
    id: "choice-1",
    type: "CHOOSE_YES_NO",
    forPlayer: "player-1",
    prompt: "Resolve?",
    constraints: {}
  };
}

describe("createGameStore", () => {
  it("derives lobby snapshot and lifecycle from adapter-driven updates", () => {
    const store = createGameStore();

    store.getState().applyConnectionStatus("connected");
    store.getState().applyViewModel(createViewModel());

    expect(store.getState().lifecycleState).toBe("lobby_ready");
    expect(store.getState().lobbySnapshot).toEqual({
      participants: [{ userId: "player-1", seat: "P1", ready: true }],
      gameId: null,
      gameStatus: "not_started"
    });
  });

  it("tracks game view, pending choice, and recent events from updates", () => {
    const store = createGameStore();
    const pendingChoice = createPendingChoice();

    store.getState().applyConnectionStatus("connected");
    store.getState().applyViewModel(
      createViewModel({
        gameId: "10000000-0000-4000-8000-000000000001",
        gameStatus: "started",
        latestAppliedVersion: { stateVersion: 3, lastAppliedEventSeq: 7 },
        pendingChoice,
        lastEventType: "PRIORITY_PASSED"
      })
    );
    store.getState().applyGameView(createGameView({ pendingChoice }));

    expect(store.getState().lifecycleState).toBe("game_active");
    expect(store.getState().pendingChoice).toEqual(pendingChoice);
    expect(store.getState().gameView?.viewerPlayerId).toBe("player-1");
    expect(store.getState().recentEvents).toEqual([{ seq: 7, eventType: "PRIORITY_PASSED" }]);
  });

  it("preserves pending choice during transient started-game resync snapshots", () => {
    const store = createGameStore();
    const pendingChoice = createPendingChoice();

    store.getState().applyConnectionStatus("connected");
    store.getState().applyViewModel(
      createViewModel({
        gameId: "game-a",
        gameStatus: "started",
        latestAppliedVersion: { stateVersion: 3, lastAppliedEventSeq: 9 },
        pendingChoice,
        lastEventType: "PRIORITY_PASSED"
      })
    );

    store.getState().applyViewModel(
      createViewModel({
        gameId: "game-a",
        gameStatus: "started",
        latestAppliedVersion: null,
        pendingChoice: null,
        lastEventType: null
      })
    );

    expect(store.getState().pendingChoice).toEqual(pendingChoice);
  });

  it("does not preserve pending choice when started-game snapshot is missing gameId", () => {
    const store = createGameStore();
    const pendingChoice = createPendingChoice();

    store.getState().applyConnectionStatus("connected");
    store.getState().applyViewModel(
      createViewModel({
        gameId: "game-a",
        gameStatus: "started",
        latestAppliedVersion: { stateVersion: 3, lastAppliedEventSeq: 9 },
        pendingChoice,
        lastEventType: "PRIORITY_PASSED"
      })
    );

    store.getState().applyViewModel(
      createViewModel({
        gameId: null,
        gameStatus: "started",
        latestAppliedVersion: null,
        pendingChoice: null,
        lastEventType: null
      })
    );

    expect(store.getState().pendingChoice).toBeNull();
  });

  it("clears preserved pending choice when refreshed game view reports no pending choice", () => {
    const store = createGameStore();
    const pendingChoice = createPendingChoice();

    store.getState().applyViewModel(
      createViewModel({
        gameId: "game-a",
        gameStatus: "started",
        latestAppliedVersion: { stateVersion: 3, lastAppliedEventSeq: 9 },
        pendingChoice,
        lastEventType: "PRIORITY_PASSED"
      })
    );

    store.getState().applyViewModel(
      createViewModel({
        gameId: "game-a",
        gameStatus: "started",
        latestAppliedVersion: null,
        pendingChoice: null,
        lastEventType: null
      })
    );
    expect(store.getState().pendingChoice).toEqual(pendingChoice);

    store.getState().applyGameView(createGameView({ pendingChoice: null }));
    expect(store.getState().pendingChoice).toBeNull();
  });

  it("resets and caps recent events across game boundaries", () => {
    const store = createGameStore();

    store.getState().applyConnectionStatus("connected");
    for (let index = 1; index <= 12; index += 1) {
      store.getState().applyViewModel(
        createViewModel({
          gameId: "game-a",
          gameStatus: "started",
          latestAppliedVersion: { stateVersion: index, lastAppliedEventSeq: index },
          lastEventType: `EVENT_${index}`
        })
      );
    }

    expect(store.getState().recentEvents).toHaveLength(10);
    expect(store.getState().recentEvents[0]).toEqual({ seq: 3, eventType: "EVENT_3" });

    store.getState().applyViewModel(
      createViewModel({
        gameId: "game-b",
        gameStatus: "started",
        latestAppliedVersion: null,
        lastEventType: null
      })
    );

    expect(store.getState().recentEvents).toEqual([]);
  });

  it("delegates command actions through the injected adapter", async () => {
    const passPriority = vi.fn().mockResolvedValue(undefined);
    const makeChoice = vi.fn().mockResolvedValue(undefined);
    const playLand = vi.fn().mockResolvedValue(undefined);
    const castSpell = vi.fn().mockResolvedValue(undefined);
    const activateAbility = vi.fn().mockResolvedValue(undefined);
    const concede = vi.fn().mockResolvedValue(undefined);
    const fetchGameState = vi.fn().mockResolvedValue(createGameView());
    const store = createGameStore();

    store.getState().attachAdapter({
      fetchGameState,
      submitGameplayCommand: async (command: GameplayCommand) => {
        switch (command.type) {
          case "PASS_PRIORITY":
            return passPriority(command);
          case "MAKE_CHOICE":
            return makeChoice(command);
          case "PLAY_LAND":
            return playLand(command);
          case "CAST_SPELL":
            return castSpell(command);
          case "ACTIVATE_ABILITY":
            return activateAbility(command);
          case "CONCEDE":
            return concede(command);
          default:
            throw new Error(`unexpected command ${command.type}`);
        }
      }
    });

    await store.getState().passPriority();
    await store.getState().makeChoice({ type: "CHOOSE_YES_NO", accepted: true });
    await store.getState().playLand("land-1");
    await store.getState().castSpell("spell-1");
    await store
      .getState()
      .castSpell("spell-2", [{ kind: "object", object: { id: "stack-obj", zcc: 0 } }]);
    await store.getState().activateAbility("island-1", 0);
    await store.getState().concede();
    await store.getState().fetchGameState();

    expect(passPriority).toHaveBeenCalledWith({ type: "PASS_PRIORITY" });
    expect(makeChoice).toHaveBeenCalledWith({
      type: "MAKE_CHOICE",
      payload: { type: "CHOOSE_YES_NO", accepted: true }
    });
    expect(playLand).toHaveBeenCalledWith({ type: "PLAY_LAND", cardId: "land-1" });
    expect(castSpell).toHaveBeenNthCalledWith(1, { type: "CAST_SPELL", cardId: "spell-1" });
    expect(castSpell).toHaveBeenNthCalledWith(2, {
      type: "CAST_SPELL",
      cardId: "spell-2",
      targets: [{ kind: "object", object: { id: "stack-obj", zcc: 0 } }]
    });
    expect(activateAbility).toHaveBeenCalledWith({
      type: "ACTIVATE_ABILITY",
      sourceId: "island-1",
      abilityIndex: 0
    });
    expect(concede).toHaveBeenCalledWith({ type: "CONCEDE" });
    expect(fetchGameState).toHaveBeenCalledTimes(1);
    expect(store.getState().gameView?.viewerPlayerId).toBe("player-1");
  });

  it("does not submit pass priority when the viewer does not have priority", async () => {
    const submitGameplayCommand = vi.fn().mockResolvedValue(undefined);
    const store = createGameStore();

    store.getState().applyGameView(
      createGameView({
        turnState: {
          phase: "MAIN_1",
          activePlayerId: "player-1",
          priorityPlayerId: "player-2"
        }
      })
    );
    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand
    });

    await store.getState().passPriority();

    expect(submitGameplayCommand).not.toHaveBeenCalled();
    expect(store.getState().isSubmittingCommand).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it("does not submit play land when the viewer does not have priority", async () => {
    const submitGameplayCommand = vi.fn().mockResolvedValue(undefined);
    const store = createGameStore();

    store.getState().applyGameView(
      createGameView({
        turnState: {
          phase: "MAIN_1",
          activePlayerId: "player-1",
          priorityPlayerId: "player-2"
        }
      })
    );
    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand
    });

    await store.getState().playLand("land-1");

    expect(submitGameplayCommand).not.toHaveBeenCalled();
    expect(store.getState().isSubmittingCommand).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it("does not submit cast spell when the viewer does not have priority", async () => {
    const submitGameplayCommand = vi.fn().mockResolvedValue(undefined);
    const store = createGameStore();

    store.getState().applyGameView(
      createGameView({
        turnState: {
          phase: "MAIN_1",
          activePlayerId: "player-1",
          priorityPlayerId: "player-2"
        }
      })
    );
    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand
    });

    await store.getState().castSpell("spell-1");

    expect(submitGameplayCommand).not.toHaveBeenCalled();
    expect(store.getState().isSubmittingCommand).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it("tracks loading and error state for game-state fetches", async () => {
    const error = new Error("boom");
    const store = createGameStore();

    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockRejectedValue(error),
      submitGameplayCommand: vi.fn()
    });

    await expect(store.getState().fetchGameState()).rejects.toThrow("boom");

    expect(store.getState().isLoadingGameState).toBe(false);
    expect(store.getState().error).toBe("boom");

    store.getState().clearError();
    expect(store.getState().error).toBeNull();
  });

  it("clears error lifecycle when a retry fetch starts and succeeds", async () => {
    const store = createGameStore();

    store.getState().applyConnectionStatus("connected");
    store.getState().applyViewModel(createViewModel({ gameStatus: "started", gameId: "game-a" }));
    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand: vi.fn()
    });
    store.setState({ error: "boom", lifecycleState: "error" });

    await store.getState().fetchGameState();

    expect(store.getState().error).toBeNull();
    expect(store.getState().lifecycleState).toBe("game_active");
  });

  it("tracks command submission loading state and error handling", async () => {
    const store = createGameStore();
    const deferred = new Promise<never>((_, reject) => {
      queueMicrotask(() => reject(new Error("submit failed")));
    });

    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand: vi.fn().mockImplementation(() => deferred)
    });

    await expect(store.getState().passPriority()).rejects.toThrow("submit failed");

    expect(store.getState().isSubmittingCommand).toBe(false);
    expect(store.getState().error).toBe(
      "Command failed. Wait for the next state refresh, then try again."
    );
    expect(store.getState().lifecycleState).toBe("error");
  });

  it("shows concise actionable command error for rejected server responses", async () => {
    const store = createGameStore();

    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand: vi
        .fn()
        .mockRejectedValue(new ServerApiError(409, "conflict", "conflict"))
    });

    await expect(store.getState().passPriority()).rejects.toThrow("conflict");

    expect(store.getState().error).toBe(
      "The game state changed. Wait for refresh, then try again."
    );
    expect(store.getState().lifecycleState).toBe("error");
  });

  it("keeps active gameplay lifecycle on invalid command responses", async () => {
    const store = createGameStore();

    store.getState().applyConnectionStatus("connected");
    store.getState().applyViewModel(createViewModel({ gameStatus: "started", gameId: "game-a" }));
    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand: vi
        .fn()
        .mockRejectedValue(new ServerApiError(409, "invalid", "invalid_command"))
    });

    await expect(store.getState().playLand("land-1")).rejects.toThrow("invalid");

    expect(store.getState().error).toBe("That action is not legal right now.");
    expect(store.getState().lifecycleState).toBe("game_active");
  });

  it("shows server-issue message for 5xx command failures", async () => {
    const store = createGameStore();

    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand: vi.fn().mockRejectedValue(new ServerApiError(503, "unavailable"))
    });

    await expect(store.getState().concede()).rejects.toThrow("unavailable");

    expect(store.getState().error).toBe("Server issue detected. Wait a moment, then try again.");
  });

  it("clears error lifecycle when command retries start and succeed", async () => {
    const store = createGameStore();

    store.getState().applyConnectionStatus("connected");
    store.getState().applyViewModel(createViewModel({ gameStatus: "started", gameId: "game-a" }));
    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(createGameView()),
      submitGameplayCommand: vi.fn().mockResolvedValue(undefined)
    });

    for (const action of [
      store.getState().passPriority,
      () => store.getState().makeChoice({ type: "CHOOSE_YES_NO", accepted: true }),
      () => store.getState().playLand("land-1"),
      () => store.getState().castSpell("spell-1"),
      store.getState().concede
    ]) {
      store.setState({ error: "boom", lifecycleState: "error" });
      await action();
      expect(store.getState().error).toBeNull();
      expect(store.getState().lifecycleState).toBe("game_active");
    }
  });

  it("keeps projected game state as the source of truth after play/cast submissions", async () => {
    const initialView = createGameView({
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
      }
    });
    const store = createGameStore();

    store.getState().applyGameView(initialView);
    store.getState().attachAdapter({
      fetchGameState: vi.fn().mockResolvedValue(initialView),
      submitGameplayCommand: vi.fn().mockResolvedValue(undefined)
    });

    await store.getState().playLand("obj-1");
    await store.getState().castSpell("obj-1");

    expect(store.getState().gameView).toEqual(initialView);
  });
});
