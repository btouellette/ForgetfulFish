import { describe, expect, it, vi } from "vitest";

import { createGameSessionAdapter } from "./game-session-adapter";

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
});
