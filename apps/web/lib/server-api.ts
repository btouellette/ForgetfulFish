import {
  gameplayCommandResponseSchema,
  playerGameViewSchema
} from "@forgetful-fish/realtime-contract";
import type {
  GameplayCommand,
  GameplayCommandResponse,
  PlayerGameView
} from "@forgetful-fish/realtime-contract";

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
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
    this.code = code;
  }
}

async function readErrorCode(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  const payload = (await response.json()) as unknown;

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return null;
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
    const code = await readErrorCode(response);
    throw new ServerApiError(response.status, `server request failed (${response.status})`, code);
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

export async function getGameState(roomId: string): Promise<PlayerGameView> {
  const response = await requestJson<unknown>(`/api/rooms/${encodeURIComponent(roomId)}/game`);
  const parsed = playerGameViewSchema.safeParse(response);

  if (!parsed.success) {
    throw new Error(
      `server response failed player game view schema validation: ${parsed.error.message}`
    );
  }

  return parsed.data;
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

export async function submitGameplayCommand(
  roomId: string,
  command: GameplayCommand
): Promise<GameplayCommandResponse> {
  const response = await requestJson<unknown>(`/api/rooms/${encodeURIComponent(roomId)}/commands`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ command })
  });

  const parsed = gameplayCommandResponseSchema.safeParse(response);

  if (!parsed.success) {
    throw new Error(
      `server response failed gameplay command schema validation: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
