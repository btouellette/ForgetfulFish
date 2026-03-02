import { describe, expect, it } from "vitest";

import { parseRoomIdInput } from "./room-id";

describe("parseRoomIdInput", () => {
  it("returns room ID when input is a valid UUID", () => {
    expect(parseRoomIdInput("11111111-2222-4333-8444-555555555555")).toBe(
      "11111111-2222-4333-8444-555555555555"
    );
  });

  it("extracts room ID from /play URL", () => {
    expect(
      parseRoomIdInput("https://forgetfulfish.com/play/11111111-2222-4333-8444-555555555555")
    ).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("returns empty string when input is blank", () => {
    expect(parseRoomIdInput("   ")).toBe("");
  });

  it("returns empty string for non-UUID input", () => {
    expect(parseRoomIdInput("not-a-room-id")).toBe("");
  });

  it("returns empty string for malformed /play URL", () => {
    expect(parseRoomIdInput("https://forgetfulfish.com/play/not-a-room-id")).toBe("");
  });

  it("returns empty string for non-play URL path", () => {
    expect(
      parseRoomIdInput("https://forgetfulfish.com/rooms/11111111-2222-4333-8444-555555555555")
    ).toBe("");
  });
});
