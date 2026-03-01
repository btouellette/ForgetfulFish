import type { RoomRealtimeStatus } from "./room-realtime";

export const disconnectedLobbyPollIntervalMs = 3000;

export function shouldPollLobbyWhileDisconnected(status: RoomRealtimeStatus) {
  return status === "reconnecting" || status === "offline";
}

export function getRealtimeGuardrailMessage(status: RoomRealtimeStatus) {
  if (status === "reconnecting") {
    return "Live sync is reconnecting. Other players may not update until connection recovers.";
  }

  if (status === "offline") {
    return "Live sync is offline. Other players may not update until connection recovers.";
  }

  return null;
}

export function getReadyUpdateStatusMessage(ready: boolean, status: RoomRealtimeStatus) {
  const readiness = ready ? "ready" : "not ready";

  if (status === "connected") {
    return `You are now ${readiness}.`;
  }

  if (status === "reconnecting") {
    return `You are now ${readiness}. State saved, but live sync is reconnecting.`;
  }

  if (status === "offline") {
    return `You are now ${readiness}. State saved, but live sync is offline.`;
  }

  return `You are now ${readiness}. State saved; waiting for live sync.`;
}
