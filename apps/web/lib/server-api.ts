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
    throw new Error(`server request failed (${response.status})`);
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
