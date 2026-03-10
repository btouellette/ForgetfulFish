import type { GameplayCommand, GameplayCommandResponse } from "@forgetful-fish/realtime-contract";

const DEFAULT_SERVER_BASE_URL = (process.env.NEXT_PUBLIC_SERVER_BASE_URL ?? "").trim();

type Actor = {
  userId: string;
  email: string;
};

type RoomCreated = {
  roomId: string;
  ownerUserId: string;
  seat: "P1" | "P2";
};

type RoomJoined = {
  roomId: string;
  userId: string;
  seat: "P1" | "P2";
};

type RoomLobbyParticipant = {
  userId: string;
  seat: "P1" | "P2";
  ready: boolean;
};

type RoomLobby = {
  roomId: string;
  participants: RoomLobbyParticipant[];
  gameId: string | null;
  gameStatus: "not_started" | "started";
};

type RoomReadyState = {
  roomId: string;
  userId: string;
  seat: "P1" | "P2";
  ready: boolean;
};

type RoomStarted = {
  roomId: string;
  gameId: string;
  gameStatus: "started";
};

export class ServerApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function buildServerApiUrl(path: string, baseUrl = DEFAULT_SERVER_BASE_URL) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl.trim());

  if (!normalizedBaseUrl) {
    return path;
  }

  return `${normalizedBaseUrl}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildServerApiUrl(path), {
    ...init,
    credentials: "include",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new ServerApiError(response.status, `server request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export function getActor() {
  return requestJson<Actor>("/api/me");
}

export function createRoom() {
  return requestJson<RoomCreated>("/api/rooms", {
    method: "POST"
  });
}

export function joinRoom(roomId: string) {
  return requestJson<RoomJoined>(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
    method: "POST"
  });
}

export function getRoomLobby(roomId: string) {
  return requestJson<RoomLobby>(`/api/rooms/${encodeURIComponent(roomId)}`);
}

export function setRoomReady(roomId: string, ready: boolean) {
  return requestJson<RoomReadyState>(`/api/rooms/${encodeURIComponent(roomId)}/ready`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ ready })
  });
}

export function startRoomGame(roomId: string) {
  return requestJson<RoomStarted>(`/api/rooms/${encodeURIComponent(roomId)}/start`, {
    method: "POST"
  });
}

export function submitGameplayCommand(roomId: string, command: GameplayCommand) {
  return requestJson<GameplayCommandResponse>(`/api/rooms/${encodeURIComponent(roomId)}/commands`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ command })
  });
}
