import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRoomWebSocketUrl, createRoomRealtimeClient } from "./room-realtime";

type RoomRealtimeStatus = "connecting" | "connected" | "reconnecting" | "offline";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly OPEN = 1;
  readonly CONNECTING = 0;
  readonly CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send() {}

  close() {
    this.readyState = this.CLOSED;
    this.onclose?.({ code: 1000 });
  }

  emitOpen() {
    this.readyState = this.OPEN;
    this.onopen?.();
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitClose(code = 1006) {
    this.readyState = this.CLOSED;
    this.onclose?.({ code });
  }
}

describe("buildRoomWebSocketUrl", () => {
  it("converts http base URL into ws room URL", () => {
    expect(
      buildRoomWebSocketUrl("00000000-0000-4000-8000-000000000001", "http://localhost:4000")
    ).toBe("ws://localhost:4000/ws/rooms/00000000-0000-4000-8000-000000000001");
  });

  it("converts https base URL into wss room URL", () => {
    expect(
      buildRoomWebSocketUrl("00000000-0000-4000-8000-000000000001", "https://forgetfulfish.com")
    ).toBe("wss://forgetfulfish.com/ws/rooms/00000000-0000-4000-8000-000000000001");
  });
});

describe("createRoomRealtimeClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    FakeWebSocket.instances = [];
  });

  it("applies subscribed and game started events", () => {
    const statuses: string[] = [];
    const snapshots: unknown[] = [];
    const starts: unknown[] = [];

    const client = createRoomRealtimeClient({
      roomId: "00000000-0000-4000-8000-000000000001",
      serverBaseUrl: "http://localhost:4000",
      webSocketFactory: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
      onStatusChange: (status: RoomRealtimeStatus) => {
        statuses.push(status);
      },
      onLobbySnapshot: (snapshot: unknown) => {
        snapshots.push(snapshot);
      },
      onLobbyUpdated: () => {},
      onGameStarted: (payload: unknown) => {
        starts.push(payload);
      }
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];

    if (!socket) {
      throw new Error("expected socket instance");
    }

    socket.emitOpen();
    socket.emitMessage({
      type: "subscribed",
      schemaVersion: 1,
      data: {
        roomId: "00000000-0000-4000-8000-000000000001",
        participants: [],
        gameId: null,
        gameStatus: "not_started"
      }
    });
    socket.emitMessage({
      type: "game_started",
      schemaVersion: 1,
      data: {
        roomId: "00000000-0000-4000-8000-000000000001",
        gameId: "10000000-0000-4000-8000-000000000001",
        gameStatus: "started"
      }
    });

    expect(statuses).toContain("connected");
    expect(snapshots).toHaveLength(1);
    expect(starts).toHaveLength(1);
  });

  it("reconnects after unexpected close", () => {
    vi.useFakeTimers();

    const statuses: string[] = [];
    const client = createRoomRealtimeClient({
      roomId: "00000000-0000-4000-8000-000000000001",
      serverBaseUrl: "http://localhost:4000",
      webSocketFactory: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
      onStatusChange: (status: RoomRealtimeStatus) => {
        statuses.push(status);
      },
      onLobbySnapshot: () => {},
      onLobbyUpdated: () => {},
      onGameStarted: () => {}
    });

    client.connect();
    const firstSocket = FakeWebSocket.instances[0];

    if (!firstSocket) {
      throw new Error("expected first socket instance");
    }

    firstSocket.emitOpen();
    firstSocket.emitClose(1006);

    expect(statuses).toContain("reconnecting");
    vi.advanceTimersByTime(500);

    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
