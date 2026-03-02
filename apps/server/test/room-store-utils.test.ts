import { describe, expect, it } from "vitest";

import {
  compareSeats,
  isUniqueConstraintError,
  normalizeRoomSeat,
  sortParticipantsBySeat
} from "../src/room-store/utils";

describe("room-store utils", () => {
  it("normalizes valid room seats", () => {
    expect(normalizeRoomSeat("P1")).toBe("P1");
    expect(normalizeRoomSeat("P2")).toBe("P2");
  });

  it("throws for invalid room seats", () => {
    expect(() => normalizeRoomSeat("P3")).toThrow("invalid room seat: P3");
  });

  it("compares seats in canonical order", () => {
    expect(compareSeats("P1", "P1")).toBe(0);
    expect(compareSeats("P1", "P2")).toBeLessThan(0);
    expect(compareSeats("P2", "P1")).toBeGreaterThan(0);
  });

  it("sorts participants by seat", () => {
    const sorted = sortParticipantsBySeat([
      { userId: "user-2", seat: "P2", ready: true },
      { userId: "user-1", seat: "P1", ready: false }
    ]);

    expect(sorted).toEqual([
      { userId: "user-1", seat: "P1", ready: false },
      { userId: "user-2", seat: "P2", ready: true }
    ]);
  });

  it("detects Prisma unique constraint errors", () => {
    expect(isUniqueConstraintError({ code: "P2002" })).toBe(true);
    expect(isUniqueConstraintError({ code: "P2001" })).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError("P2002")).toBe(false);
  });
});
