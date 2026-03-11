import { describe, expect, it, vi } from "vitest";

import {
  ServerApiError,
  buildServerApiUrl,
  getGameState,
  joinRoom,
  submitGameplayCommand
} from "./server-api";

function createPlayerGameViewPayload() {
  return {
    viewerPlayerId: "player-1",
    stateVersion: 2,
    turnState: {
      phase: "MAIN_1",
      activePlayerId: "player-1",
      priorityPlayerId: "player-2"
    },
    viewer: {
      id: "player-1",
      life: 20,
      manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [],
      handCount: 0
    },
    opponent: {
      id: "player-2",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 0
    },
    zones: [{ zoneRef: { kind: "library", scope: "shared" }, count: 40 }],
    objectPool: {},
    stack: [],
    pendingChoice: null
  };
}

describe("buildServerApiUrl", () => {
  it("uses relative path when no base URL is configured", () => {
    expect(buildServerApiUrl("/api/me", "")).toBe("/api/me");
  });

  it("joins base URL and path", () => {
    expect(buildServerApiUrl("/api/me", "http://localhost:4000")).toBe(
      "http://localhost:4000/api/me"
    );
  });

  it("trims trailing slash from base URL", () => {
    expect(buildServerApiUrl("/api/me", "https://forgetfulfish.com/")).toBe(
      "https://forgetfulfish.com/api/me"
    );
  });
});

describe("server API request errors", () => {
  it("throws ServerApiError with HTTP status", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "room_full" }), {
        status: 409,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    try {
      await joinRoom("11111111-2222-4333-8444-555555555555");
      throw new Error("expected joinRoom to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ServerApiError);
      expect(error).toMatchObject({
        status: 409,
        message: "server request failed (409)"
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("submitGameplayCommand", () => {
  it("posts command payload to room command endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId: "00000000-0000-4000-8000-000000000001",
          gameId: "10000000-0000-4000-8000-000000000001",
          stateVersion: 2,
          lastAppliedEventSeq: 1,
          pendingChoice: null,
          emittedEvents: [{ seq: 1, eventType: "PRIORITY_PASSED" }]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    try {
      const response = await submitGameplayCommand("00000000-0000-4000-8000-000000000001", {
        type: "PASS_PRIORITY"
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        buildServerApiUrl("/api/rooms/00000000-0000-4000-8000-000000000001/commands"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            command: {
              type: "PASS_PRIORITY"
            }
          }),
          credentials: "include",
          cache: "no-store"
        }
      );

      expect(response).toMatchObject({
        roomId: "00000000-0000-4000-8000-000000000001",
        stateVersion: 2,
        lastAppliedEventSeq: 1
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects invalid gameplay command response payloads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId: "00000000-0000-4000-8000-000000000001",
          gameId: "10000000-0000-4000-8000-000000000001",
          stateVersion: 2,
          pendingChoice: null,
          emittedEvents: []
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    try {
      await expect(
        submitGameplayCommand("00000000-0000-4000-8000-000000000001", {
          type: "PASS_PRIORITY"
        })
      ).rejects.toThrow(/server response failed gameplay command schema validation/);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("getGameState", () => {
  it("fetches and validates projected player game state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createPlayerGameViewPayload()), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    try {
      const response = await getGameState("00000000-0000-4000-8000-000000000001");

      expect(fetchSpy).toHaveBeenCalledWith(
        buildServerApiUrl("/api/rooms/00000000-0000-4000-8000-000000000001/game"),
        {
          credentials: "include",
          cache: "no-store"
        }
      );
      expect(response).toMatchObject({
        viewerPlayerId: "player-1",
        stateVersion: 2
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects invalid projected game-state payloads", async () => {
    const { turnState: _turnState, ...invalidPayload } = createPlayerGameViewPayload();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(invalidPayload), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    try {
      await expect(getGameState("00000000-0000-4000-8000-000000000001")).rejects.toThrow(
        /server response failed player game view schema validation/
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
