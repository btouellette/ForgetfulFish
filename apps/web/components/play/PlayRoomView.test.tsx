import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlayRoomView } from "./PlayRoomView";

const noop = vi.fn();

function baseProps() {
  return {
    roomId: "00000000-0000-4000-8000-000000000001",
    status: "Joined room 00000000-0000-4000-8000-000000000001 as seat P1.",
    gameStatus: "not_started" as const,
    gameId: null,
    lifecycleState: "lobby_ready" as const,
    connectionStatus: "connected" as const,
    realtimeGuardrailMessage: null,
    participants: [
      { userId: "player-1", seat: "P1" as const, ready: true },
      { userId: "player-2", seat: "P2" as const, ready: false }
    ],
    viewerId: "player-1",
    isSubmittingLobbyAction: false,
    gameView: null,
    recentEvents: [],
    pendingChoice: null,
    isSubmittingCommand: false,
    error: null,
    onReadyToggle: noop,
    onStartGame: noop,
    onPassPriority: noop,
    onConcede: noop,
    onMakeChoice: noop,
    onClearError: noop
  };
}

describe("PlayRoomView", () => {
  it("renders lobby data through LobbyView while in lobby lifecycle states", () => {
    const html = renderToStaticMarkup(<PlayRoomView {...baseProps()} />);

    expect(html).toContain("Lifecycle: lobby_ready");
    expect(html).toContain("P1: player-1 (ready)");
    expect(html).toContain("P2: player-2 (not ready)");
    expect(html).toContain("Mark not ready");
    expect(html).toContain("Start game");
  });

  it("renders the composed gameplay shell during active games", () => {
    const html = renderToStaticMarkup(
      <PlayRoomView
        {...baseProps()}
        lifecycleState="game_active"
        gameStatus="started"
        gameId="10000000-0000-4000-8000-000000000001"
        gameView={{
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
            manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
            hand: [],
            handCount: 0
          },
          opponent: {
            id: "player-2",
            life: 18,
            manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
            handCount: 2
          },
          zones: [],
          objectPool: {},
          stack: [],
          pendingChoice: null
        }}
        recentEvents={[]}
        pendingChoice={null}
        isSubmittingCommand={false}
        error={null}
        onPassPriority={noop}
        onConcede={noop}
        onMakeChoice={noop}
        onClearError={noop}
      />
    );

    expect(html).toContain("Lifecycle: game_active");
    expect(html).toContain("Status");
    expect(html).toContain("Commands");
    expect(html).toContain("<canvas");
  });

  it("shows a safe fallback when gameplay has started before the game id is available", () => {
    const html = renderToStaticMarkup(
      <PlayRoomView
        {...baseProps()}
        lifecycleState="game_active"
        gameStatus="started"
        gameId={null}
      />
    );

    expect(html).toContain("Game: started (loading...)");
  });

  it("surfaces resyncing status without changing lobby presentation shape", () => {
    const html = renderToStaticMarkup(
      <PlayRoomView
        {...baseProps()}
        lifecycleState="resyncing"
        realtimeGuardrailMessage="Realtime reconnecting..."
      />
    );

    expect(html).toContain("Lifecycle: resyncing");
    expect(html).toContain("Realtime reconnecting...");
    expect(html).toContain("P1: player-1 (ready)");
  });

  it("keeps the lobby shell visible for joining and error lifecycle states", () => {
    const joiningHtml = renderToStaticMarkup(
      <PlayRoomView {...baseProps()} lifecycleState="joining" status="Joining room..." />
    );
    const errorHtml = renderToStaticMarkup(
      <PlayRoomView {...baseProps()} lifecycleState="error" status="Join failed: Room not found." />
    );

    expect(joiningHtml).toContain("Lifecycle: joining");
    expect(joiningHtml).toContain("Mark not ready");
    expect(errorHtml).toContain("Lifecycle: error");
    expect(errorHtml).toContain("Join failed: Room not found.");
  });
});
