import type { RoomRealtimeStatus } from "./room-realtime";

export type PlayLifecycleState = "joining" | "lobby_ready" | "game_active" | "resyncing" | "error";

type DerivePlayLifecycleStateOptions = {
  isJoining: boolean;
  hasError: boolean;
  gameStatus: "not_started" | "started";
  connectionStatus: RoomRealtimeStatus;
};

export function derivePlayLifecycleState({
  isJoining,
  hasError,
  gameStatus,
  connectionStatus
}: DerivePlayLifecycleStateOptions): PlayLifecycleState {
  if (hasError) {
    return "error";
  }

  if (isJoining) {
    return "joining";
  }

  if (
    connectionStatus === "connecting" ||
    connectionStatus === "reconnecting" ||
    connectionStatus === "offline"
  ) {
    return "resyncing";
  }

  if (gameStatus === "started") {
    return "game_active";
  }

  return "lobby_ready";
}
