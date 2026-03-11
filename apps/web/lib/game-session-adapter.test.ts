import { describe, expect, it, vi } from "vitest";

import { createGameSessionAdapter, toSessionStatusMessage } from "./game-session-adapter";
import { ServerApiError } from "./server-api";

function createPlayerGameView() {
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
      manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [],
      handCount: 0
    },
    opponent: {
      id: "player-2",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 0
    },
    zones: [{ zoneRef: { kind: "library", scope: "shared" }, count: 40 }],
    objectPool: {},
    stack: [],
    pendingChoice: null
  };
}

type CreateRealtimeClient = NonNullable<
  Parameters<typeof createGameSessionAdapter>[0]["createRealtimeClient"]
>;
type CreateRealtimeClientOptions = Parameters<CreateRealtimeClient>[0];
type LobbySnapshotHandler = CreateRealtimeClientOptions["onLobbySnapshot"];
type LobbyUpdatedHandler = CreateRealtimeClientOptions["onLobbyUpdated"];
type GameStartedHandler = CreateRealtimeClientOptions["onGameStarted"];
type GameUpdatedHandler = NonNullable<CreateRealtimeClientOptions["onGameUpdated"]>;

describe("createGameSessionAdapter", () => {
  it("delegates websocket lifecycle to adapter-owned realtime client", () => {
    const connect = vi.fn();
    const disconnect = vi.fn();

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: () => ({
        connect,
        disconnect
      }),
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    adapter.disconnect();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("tracks latest applied gameplay response version", async () => {
    const submitGameplayCommand = vi.fn().mockResolvedValue({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 2,
      lastAppliedEventSeq: 5,
      pendingChoice: null,
      emittedEvents: []
    });

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: () => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      }),
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand
      }
    });

    await adapter.submitGameplayCommand({ type: "PASS_PRIORITY" });

    expect(submitGameplayCommand).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", {
      type: "PASS_PRIORITY"
    });
    expect(adapter.getLatestAppliedVersion()).toEqual({
      stateVersion: 2,
      lastAppliedEventSeq: 5
    });
  });

  it("keeps latest applied version monotonic for out-of-order responses", async () => {
    const createDeferred = <T>() => {
      let resolve: ((value: T) => void) | undefined;
      const promise = new Promise<T>((resolver) => {
        resolve = resolver;
      });

      if (!resolve) {
        throw new Error("expected deferred resolver");
      }

      return { promise, resolve };
    };

    const firstResponse = createDeferred<unknown>();
    const secondResponse = createDeferred<unknown>();

    const submitGameplayCommand = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: () => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      }),
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand
      }
    });

    const firstSubmission = adapter.submitGameplayCommand({ type: "PASS_PRIORITY" });
    const secondSubmission = adapter.submitGameplayCommand({ type: "PASS_PRIORITY" });

    secondResponse.resolve({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 3,
      lastAppliedEventSeq: 7,
      pendingChoice: null,
      emittedEvents: []
    });
    await secondSubmission;

    firstResponse.resolve({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 2,
      lastAppliedEventSeq: 5,
      pendingChoice: null,
      emittedEvents: []
    });
    await firstSubmission;

    expect(adapter.getLatestAppliedVersion()).toEqual({
      stateVersion: 3,
      lastAppliedEventSeq: 7
    });
  });

  it("drops stale realtime gameplay updates before forwarding to UI callback", () => {
    const onGameUpdated = vi.fn();
    let gameUpdatedHandler: GameUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onGameUpdated,
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        if (options.onGameUpdated) {
          gameUpdatedHandler = options.onGameUpdated;
        }

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();

    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 3,
      lastAppliedEventSeq: 7,
      pendingChoice: null,
      emittedEvents: []
    });

    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 2,
      lastAppliedEventSeq: 5,
      pendingChoice: null,
      emittedEvents: []
    });

    expect(onGameUpdated).toHaveBeenCalledTimes(1);
    expect(adapter.getLatestAppliedVersion()).toEqual({
      stateVersion: 3,
      lastAppliedEventSeq: 7
    });
  });

  it("treats subscribed snapshot as canonical reset point for version tracking", () => {
    const onGameUpdated = vi.fn();
    let lobbySnapshotHandler: LobbySnapshotHandler = () => {};
    let gameUpdatedHandler: GameUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onGameUpdated,
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        lobbySnapshotHandler = options.onLobbySnapshot;

        if (options.onGameUpdated) {
          gameUpdatedHandler = options.onGameUpdated;
        }

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();

    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 5,
      lastAppliedEventSeq: 11,
      pendingChoice: null,
      emittedEvents: []
    });

    lobbySnapshotHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      participants: [],
      gameId: "10000000-0000-4000-8000-000000000001",
      gameStatus: "started"
    });

    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 2,
      lastAppliedEventSeq: 4,
      pendingChoice: null,
      emittedEvents: []
    });

    expect(onGameUpdated).toHaveBeenCalledTimes(2);
    expect(adapter.getLatestAppliedVersion()).toEqual({
      stateVersion: 2,
      lastAppliedEventSeq: 4
    });
  });

  it("normalizes lobby snapshots into view model state", () => {
    const onViewModelChange = vi.fn();
    let lobbySnapshotHandler: LobbySnapshotHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onViewModelChange,
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        lobbySnapshotHandler = options.onLobbySnapshot;
        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();

    lobbySnapshotHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      participants: [{ userId: "u-1", seat: "P1", ready: true }],
      gameId: null,
      gameStatus: "not_started"
    });

    expect(adapter.getViewModel()).toMatchObject({
      roomId: "00000000-0000-4000-8000-000000000001",
      participants: [{ userId: "u-1", seat: "P1", ready: true }],
      gameId: null,
      gameStatus: "not_started",
      pendingChoice: null,
      lastEventType: null,
      latestAppliedVersion: null
    });
    expect(onViewModelChange).toHaveBeenCalledTimes(1);
  });

  it("normalizes gameplay updates into view model state", () => {
    let gameUpdatedHandler: GameUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        if (options.onGameUpdated) {
          gameUpdatedHandler = options.onGameUpdated;
        }

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();

    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 7,
      lastAppliedEventSeq: 19,
      pendingChoice: {
        id: "choice-1",
        type: "CHOOSE_MODE",
        forPlayer: "p1",
        prompt: "Choose a mode",
        constraints: {}
      },
      emittedEvents: [{ seq: 19, eventType: "PRIORITY_PASSED" }]
    });

    expect(adapter.getViewModel()).toMatchObject({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      gameStatus: "started",
      pendingChoice: {
        id: "choice-1",
        type: "CHOOSE_MODE"
      },
      lastEventType: "PRIORITY_PASSED",
      latestAppliedVersion: {
        stateVersion: 7,
        lastAppliedEventSeq: 19
      }
    });
  });

  it("normalizes lobby updates into view model state", () => {
    let lobbyUpdatedHandler: LobbyUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        lobbyUpdatedHandler = options.onLobbyUpdated;
        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();

    lobbyUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      participants: [{ userId: "u-2", seat: "P2", ready: false }],
      gameId: null,
      gameStatus: "not_started"
    });

    expect(adapter.getViewModel()).toMatchObject({
      participants: [{ userId: "u-2", seat: "P2", ready: false }],
      gameStatus: "not_started"
    });
  });

  it("resets gameplay projection fields when game start event arrives", () => {
    let gameStartedHandler: GameStartedHandler = () => {};
    let gameUpdatedHandler: GameUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        gameStartedHandler = options.onGameStarted;
        if (options.onGameUpdated) {
          gameUpdatedHandler = options.onGameUpdated;
        }

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 5,
      lastAppliedEventSeq: 9,
      pendingChoice: {
        id: "choice-before-start",
        type: "CHOOSE_YES_NO",
        forPlayer: "p1",
        prompt: "Resolve?",
        constraints: {}
      },
      emittedEvents: [{ seq: 9, eventType: "PRIORITY_PASSED" }]
    });

    gameStartedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "20000000-0000-4000-8000-000000000001",
      gameStatus: "started"
    });

    expect(adapter.getViewModel()).toMatchObject({
      gameId: "20000000-0000-4000-8000-000000000001",
      gameStatus: "started",
      pendingChoice: null,
      lastEventType: null,
      latestAppliedVersion: null
    });
  });

  it("updates normalized view model when command submission response is applied", async () => {
    const onViewModelChange = vi.fn();
    const submitGameplayCommand = vi.fn().mockResolvedValue({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 8,
      lastAppliedEventSeq: 21,
      pendingChoice: null,
      emittedEvents: [{ seq: 21, eventType: "PRIORITY_PASSED" }]
    });

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onViewModelChange,
      createRealtimeClient: () => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      }),
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand
      }
    });

    await adapter.submitGameplayCommand({ type: "PASS_PRIORITY" });

    expect(adapter.getViewModel()).toMatchObject({
      gameId: "10000000-0000-4000-8000-000000000001",
      gameStatus: "started",
      lastEventType: "PRIORITY_PASSED",
      latestAppliedVersion: {
        stateVersion: 8,
        lastAppliedEventSeq: 21
      }
    });
    expect(onViewModelChange).toHaveBeenCalled();
  });

  it("returns an immutable snapshot from getViewModel", () => {
    let gameUpdatedHandler: GameUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        if (options.onGameUpdated) {
          gameUpdatedHandler = options.onGameUpdated;
        }

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState: vi.fn(),
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 4,
      lastAppliedEventSeq: 7,
      pendingChoice: null,
      emittedEvents: []
    });

    const viewModelSnapshot = adapter.getViewModel();
    viewModelSnapshot.gameId = null;
    viewModelSnapshot.participants = [{ userId: "mutated", seat: "P1", ready: false }];

    expect(adapter.getViewModel()).toMatchObject({
      gameId: "10000000-0000-4000-8000-000000000001",
      participants: []
    });
  });

  it("fetches projected game state when game start event arrives", async () => {
    const onGameViewChange = vi.fn();
    const getGameState = vi.fn().mockResolvedValue(createPlayerGameView());
    let gameStartedHandler: GameStartedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onGameViewChange,
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        gameStartedHandler = options.onGameStarted;

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState,
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    gameStartedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      gameStatus: "started"
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(getGameState).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(onGameViewChange).toHaveBeenCalledWith(createPlayerGameView());
  });

  it("fetches projected game state when subscribed snapshot shows an active game", async () => {
    const onGameViewChange = vi.fn();
    const getGameState = vi.fn().mockResolvedValue(createPlayerGameView());
    let lobbySnapshotHandler: LobbySnapshotHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onGameViewChange,
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        lobbySnapshotHandler = options.onLobbySnapshot;

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState,
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    lobbySnapshotHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      participants: [],
      gameId: "10000000-0000-4000-8000-000000000001",
      gameStatus: "started"
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(getGameState).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(onGameViewChange).toHaveBeenCalledWith(createPlayerGameView());
  });

  it("fetches projected game state after newer realtime gameplay updates", async () => {
    const onGameViewChange = vi.fn();
    const getGameState = vi.fn().mockResolvedValue(createPlayerGameView());
    let gameUpdatedHandler: GameUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onGameViewChange,
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        if (options.onGameUpdated) {
          gameUpdatedHandler = options.onGameUpdated;
        }

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState,
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 3,
      lastAppliedEventSeq: 7,
      pendingChoice: null,
      emittedEvents: [{ seq: 7, eventType: "PRIORITY_PASSED" }]
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(getGameState).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(onGameViewChange).toHaveBeenCalledWith(createPlayerGameView());
  });

  it("ignores stale game-state fetches after the adapter resets back to lobby state", async () => {
    const onGameViewChange = vi.fn();
    let resolveGameState: ((value: ReturnType<typeof createPlayerGameView>) => void) | undefined;
    const getGameState = vi.fn().mockImplementation(
      () =>
        new Promise<ReturnType<typeof createPlayerGameView>>((resolve) => {
          resolveGameState = resolve;
        })
    );
    let gameStartedHandler: GameStartedHandler = () => {};
    let lobbySnapshotHandler: LobbySnapshotHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      onGameViewChange,
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        gameStartedHandler = options.onGameStarted;
        lobbySnapshotHandler = options.onLobbySnapshot;

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState,
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    gameStartedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      gameStatus: "started"
    });
    lobbySnapshotHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      participants: [],
      gameId: null,
      gameStatus: "not_started"
    });

    if (!resolveGameState) {
      throw new Error("expected deferred game-state resolver");
    }

    resolveGameState(createPlayerGameView());
    await Promise.resolve();
    await Promise.resolve();

    expect(onGameViewChange).toHaveBeenCalledWith(null);
    expect(onGameViewChange).not.toHaveBeenCalledWith(createPlayerGameView());
    expect(adapter.getGameView()).toBeNull();
  });

  it("coalesces rapid realtime refresh requests into one follow-up fetch", async () => {
    const createDeferred = <T>() => {
      let resolve: ((value: T) => void) | undefined;
      const promise = new Promise<T>((resolver) => {
        resolve = resolver;
      });

      if (!resolve) {
        throw new Error("expected deferred resolver");
      }

      return { promise, resolve };
    };

    const firstFetch = createDeferred<ReturnType<typeof createPlayerGameView>>();
    const secondFetch = createDeferred<ReturnType<typeof createPlayerGameView>>();
    const getGameState = vi
      .fn()
      .mockImplementationOnce(() => firstFetch.promise)
      .mockImplementationOnce(() => secondFetch.promise);
    let gameUpdatedHandler: GameUpdatedHandler = () => {};

    const adapter = createGameSessionAdapter({
      roomId: "00000000-0000-4000-8000-000000000001",
      onStatusChange: () => {},
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {},
      createRealtimeClient: (options: CreateRealtimeClientOptions) => {
        if (options.onGameUpdated) {
          gameUpdatedHandler = options.onGameUpdated;
        }

        return {
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      },
      api: {
        joinRoom: vi.fn(),
        getRoomLobby: vi.fn(),
        getGameState,
        setRoomReady: vi.fn(),
        startRoomGame: vi.fn(),
        submitGameplayCommand: vi.fn()
      }
    });

    adapter.connect();
    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 3,
      lastAppliedEventSeq: 7,
      pendingChoice: null,
      emittedEvents: [{ seq: 7, eventType: "PRIORITY_PASSED" }]
    });
    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 4,
      lastAppliedEventSeq: 8,
      pendingChoice: null,
      emittedEvents: [{ seq: 8, eventType: "PRIORITY_PASSED" }]
    });
    gameUpdatedHandler({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 5,
      lastAppliedEventSeq: 9,
      pendingChoice: null,
      emittedEvents: [{ seq: 9, eventType: "PRIORITY_PASSED" }]
    });

    expect(getGameState).toHaveBeenCalledTimes(1);

    firstFetch.resolve(createPlayerGameView());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getGameState).toHaveBeenCalledTimes(2);

    secondFetch.resolve(createPlayerGameView());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getGameState).toHaveBeenCalledTimes(2);
  });
});

describe("toSessionStatusMessage", () => {
  it("maps unauthorized and forbidden server errors to clear user messages", () => {
    expect(toSessionStatusMessage(new ServerApiError(401, "server request failed (401)"))).toBe(
      "Session expired. Please verify your sign-in again."
    );
    expect(toSessionStatusMessage(new ServerApiError(403, "server request failed (403)"))).toBe(
      "You are no longer authorized for this room."
    );
  });

  it("returns null for non-session failures", () => {
    expect(
      toSessionStatusMessage(new ServerApiError(409, "server request failed (409)"))
    ).toBeNull();
    expect(toSessionStatusMessage(new Error("network"))).toBeNull();
  });
});
