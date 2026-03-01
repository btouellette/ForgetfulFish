import { buildServerApiUrl } from "./server-api";

type RoomLobbyParticipant = {
  userId: string;
  seat: "P1" | "P2";
  ready: boolean;
};

export type RoomLobbySnapshot = {
  roomId: string;
  participants: RoomLobbyParticipant[];
  gameId: string | null;
  gameStatus: "not_started" | "started";
};

export type RoomGameStarted = {
  roomId: string;
  gameId: string;
  gameStatus: "started";
};

export type RoomRealtimeStatus = "connecting" | "connected" | "reconnecting" | "offline";

type RoomRealtimeOptions = {
  roomId: string;
  serverBaseUrl?: string;
  webSocketFactory?: (url: string) => WebSocket;
  onStatusChange: (status: RoomRealtimeStatus) => void;
  onLobbySnapshot: (snapshot: RoomLobbySnapshot) => void;
  onLobbyUpdated: (snapshot: RoomLobbySnapshot) => void;
  onGameStarted: (payload: RoomGameStarted) => void;
};

type RoomServerMessage = {
  type: string;
  data?: unknown;
};

const reconnectBackoffMs = [500, 1000, 2000, 5000];

export function buildRoomWebSocketUrl(roomId: string, serverBaseUrl = "") {
  const httpUrl = buildServerApiUrl(`/ws/rooms/${encodeURIComponent(roomId)}`, serverBaseUrl);

  if (httpUrl.startsWith("https://")) {
    return `wss://${httpUrl.slice("https://".length)}`;
  }

  if (httpUrl.startsWith("http://")) {
    return `ws://${httpUrl.slice("http://".length)}`;
  }

  if (typeof window === "undefined") {
    throw new Error("relative websocket URL requires browser window context");
  }

  const pageProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${pageProtocol}//${window.location.host}${httpUrl}`;
}

function parseRoomMessage(rawData: string): RoomServerMessage | null {
  let payload: unknown;

  try {
    payload = JSON.parse(rawData) as unknown;
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null || !("type" in payload)) {
    return null;
  }

  return payload as RoomServerMessage;
}

function isRoomLobbySnapshot(value: unknown): value is RoomLobbySnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("roomId" in value) || !("participants" in value) || !("gameStatus" in value)) {
    return false;
  }

  return true;
}

function isRoomGameStarted(value: unknown): value is RoomGameStarted {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("roomId" in value) || !("gameId" in value) || !("gameStatus" in value)) {
    return false;
  }

  return true;
}

export function createRoomRealtimeClient({
  roomId,
  serverBaseUrl = "",
  webSocketFactory,
  onStatusChange,
  onLobbySnapshot,
  onLobbyUpdated,
  onGameStarted
}: RoomRealtimeOptions) {
  const createSocket = webSocketFactory ?? ((url: string) => new WebSocket(url));

  let currentSocket: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manuallyStopped = false;

  function clearReconnectTimer() {
    if (!reconnectTimer) {
      return;
    }

    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function connectInternal() {
    onStatusChange(reconnectAttempts === 0 ? "connecting" : "reconnecting");

    const socket = createSocket(buildRoomWebSocketUrl(roomId, serverBaseUrl));
    currentSocket = socket;

    socket.onopen = () => {
      reconnectAttempts = 0;
      onStatusChange("connected");
    };

    socket.onmessage = (event) => {
      const message = parseRoomMessage(String(event.data));

      if (!message) {
        return;
      }

      if (message.type === "subscribed" && isRoomLobbySnapshot(message.data)) {
        onLobbySnapshot(message.data);
        return;
      }

      if (message.type === "room_lobby_updated" && isRoomLobbySnapshot(message.data)) {
        onLobbyUpdated(message.data);
        return;
      }

      if (message.type === "game_started" && isRoomGameStarted(message.data)) {
        onGameStarted(message.data);
      }
    };

    socket.onclose = () => {
      if (manuallyStopped) {
        onStatusChange("offline");
        return;
      }

      onStatusChange("reconnecting");
      const delay = reconnectBackoffMs[Math.min(reconnectAttempts, reconnectBackoffMs.length - 1)];
      reconnectAttempts += 1;
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        connectInternal();
      }, delay);
    };

    socket.onerror = () => {
      if (socket.readyState === 0 || socket.readyState === 1) {
        socket.close();
      }
    };
  }

  return {
    connect() {
      manuallyStopped = false;
      clearReconnectTimer();
      connectInternal();
    },
    disconnect() {
      manuallyStopped = true;
      clearReconnectTimer();

      if (currentSocket && (currentSocket.readyState === 0 || currentSocket.readyState === 1)) {
        currentSocket.close();
      }

      currentSocket = null;
      onStatusChange("offline");
    }
  };
}
