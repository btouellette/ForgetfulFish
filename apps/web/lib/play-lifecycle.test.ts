import { describe, expect, it } from "vitest";

import { derivePlayLifecycleState } from "./play-lifecycle";

describe("derivePlayLifecycleState", () => {
  it("returns joining when room join is still pending", () => {
    expect(
      derivePlayLifecycleState({
        isJoining: true,
        hasError: false,
        gameStatus: "not_started",
        connectionStatus: "connecting"
      })
    ).toBe("joining");
  });

  it("returns lobby_ready when joined and game has not started", () => {
    expect(
      derivePlayLifecycleState({
        isJoining: false,
        hasError: false,
        gameStatus: "not_started",
        connectionStatus: "connected"
      })
    ).toBe("lobby_ready");
  });

  it("returns game_active while started game is connected", () => {
    expect(
      derivePlayLifecycleState({
        isJoining: false,
        hasError: false,
        gameStatus: "started",
        connectionStatus: "connected"
      })
    ).toBe("game_active");
  });

  it("returns resyncing while started game is reconnecting", () => {
    expect(
      derivePlayLifecycleState({
        isJoining: false,
        hasError: false,
        gameStatus: "started",
        connectionStatus: "reconnecting"
      })
    ).toBe("resyncing");
  });

  it("returns resyncing while lobby state is disconnected", () => {
    expect(
      derivePlayLifecycleState({
        isJoining: false,
        hasError: false,
        gameStatus: "not_started",
        connectionStatus: "offline"
      })
    ).toBe("resyncing");
  });

  it("returns error when route has an active error state", () => {
    expect(
      derivePlayLifecycleState({
        isJoining: false,
        hasError: true,
        gameStatus: "started",
        connectionStatus: "connected"
      })
    ).toBe("error");
  });
});
