import { wsServerMessageSchema } from "@forgetful-fish/realtime-contract";

import { buildServerApiUrl } from "./server-api";
import type {
  GameplayCommandResponse,
  RoomGameStarted,
  RoomLobbySnapshot
} from "@forgetful-fish/realtime-contract";

export type RoomRealtimeStatus = "connecting" | "connected" | "reconnecting" | "offline";

type RoomRealtimeOptions = {
  roomId: string;
  serverBaseUrl?: string;
  webSocketFactory?: (url: string) => WebSocket;
  onStatusChange: (status: RoomRealtimeStatus) => void;
  onLobbySnapshot: (snapshot: RoomLobbySnapshot) => void;
  onLobbyUpdated: (snapshot: RoomLobbySnapshot) => void;
  onGameStarted: (payload: RoomGameStarted) => void;
  onGameUpdated?: (payload: GameplayCommandResponse) => void;
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

function parseRoomMessage(rawData: string) {
  let payload: unknown;

  try {
    payload = JSON.parse(rawData) as unknown;
  } catch {
    return null;
  }

  const parsed = wsServerMessageSchema.safeParse(payload);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function createRoomRealtimeClient({
  roomId,
  serverBaseUrl = "",
  webSocketFactory,
  onStatusChange,
  onLobbySnapshot,
  onLobbyUpdated,
  onGameStarted,
  onGameUpdated = () => {}
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

      if (message.type === "subscribed") {
        onLobbySnapshot(message.data);
        return;
      }

      if (message.type === "room_lobby_updated") {
        onLobbyUpdated(message.data);
        return;
      }

      if (message.type === "game_started") {
        onGameStarted(message.data);
        return;
      }

      if (message.type === "room_game_updated") {
        onGameUpdated(message.data);
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
