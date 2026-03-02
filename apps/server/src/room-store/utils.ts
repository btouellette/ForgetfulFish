import type { RoomLobbyParticipant, RoomSeat } from "./types";

export function isUniqueConstraintError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === "P2002";
}

export function normalizeRoomSeat(seat: string): RoomSeat {
  if (seat === "P1" || seat === "P2") {
    return seat;
  }

  throw new Error(`invalid room seat: ${seat}`);
}

export function compareSeats(left: RoomSeat, right: RoomSeat) {
  if (left === right) {
    return 0;
  }

  return left === "P1" ? -1 : 1;
}

export function sortParticipantsBySeat(participants: RoomLobbyParticipant[]) {
  return [...participants].sort((left, right) => compareSeats(left.seat, right.seat));
}
