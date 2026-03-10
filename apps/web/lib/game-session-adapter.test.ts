import { describe, expect, it, vi } from "vitest";

import { createGameSessionAdapter, toSessionStatusMessage } from "./game-session-adapter";
import { ServerApiError } from "./server-api";

type CreateRealtimeClient = NonNullable<
  Parameters<typeof createGameSessionAdapter>[0]["createRealtimeClient"]
>;
type CreateRealtimeClientOptions = Parameters<CreateRealtimeClient>[0];
type LobbySnapshotHandler = CreateRealtimeClientOptions["onLobbySnapshot"];
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
