import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameplayPendingChoice, PlayerGameView } from "@forgetful-fish/realtime-contract";

import { GameplayView } from "./GameplayView";

function createGameView(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
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
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [
        {
          id: "obj-1",
          zcc: 0,
          cardDefId: "island",
          owner: "player-1",
          controller: "player-1",
          counters: {},
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "hand", scope: "player", playerId: "player-1" }
        },
        {
          id: "obj-2",
          zcc: 0,
          cardDefId: "brainstorm",
          owner: "player-1",
          controller: "player-1",
          counters: {},
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "hand", scope: "player", playerId: "player-1" }
        }
      ],
      handCount: 2
    },
    opponent: {
      id: "player-2",
      life: 18,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 2
    },
    zones: [
      { zoneRef: { kind: "hand", scope: "player", playerId: "player-1" }, count: 0, objectIds: [] },
      { zoneRef: { kind: "hand", scope: "player", playerId: "player-2" }, count: 2 },
      { zoneRef: { kind: "battlefield", scope: "shared" }, count: 3, objectIds: ["a", "b", "c"] }
    ],
    objectPool: {},
    stack: [],
    pendingChoice: null,
    ...overrides
  };
}

function createPendingChoice(
  overrides: Partial<GameplayPendingChoice> = {}
): GameplayPendingChoice {
  return {
    id: "choice-1",
    type: "CHOOSE_YES_NO",
    forPlayer: "player-1",
    prompt: "Resolve the spell?",
    constraints: {},
    ...overrides
  };
}

describe("GameplayView", () => {
  it("renders all gameplay panels and a live canvas host", () => {
    const html = renderToStaticMarkup(
      <GameplayView
        gameView={createGameView({ pendingChoice: createPendingChoice() })}
        recentEvents={[
          { seq: 7, eventType: "PRIORITY_PASSED" },
          { seq: 8, eventType: "STACK_ITEM_RESOLVED" }
        ]}
        pendingChoice={createPendingChoice()}
        isSubmittingCommand={false}
        error={null}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onPlayLand={vi.fn()}
        onCastSpell={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Status");
    expect(html).toContain("Commands");
    expect(html).toContain("Hand");
    expect(html).toContain("Play land");
    expect(html).toContain("Cast spell");
    expect(html).toContain("Zones");
    expect(html).toContain("Events");
    expect(html).toContain("<canvas");
  });

  it("falls back to the waiting placeholder when gameView is missing", () => {
    const html = renderToStaticMarkup(
      <GameplayView
        gameView={null}
        recentEvents={[]}
        pendingChoice={null}
        isSubmittingCommand={false}
        error={null}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onPlayLand={vi.fn()}
        onCastSpell={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Waiting for projected game state...");
    expect(html).not.toContain("Status");
    expect(html).not.toContain("Commands");
  });
});
