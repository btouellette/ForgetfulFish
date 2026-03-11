import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { ZonesSummaryPanel } from "./ZonesSummaryPanel";

function createZones(): PlayerGameView["zones"] {
  return [
    {
      zoneRef: { kind: "battlefield", scope: "player", playerId: "player-1" },
      count: 3,
      objectIds: ["a", "b", "c"]
    },
    {
      zoneRef: { kind: "graveyard", scope: "player", playerId: "player-1" },
      count: 1,
      objectIds: ["g1"]
    },
    {
      zoneRef: { kind: "battlefield", scope: "player", playerId: "player-2" },
      count: 2,
      objectIds: ["x", "y"]
    },
    {
      zoneRef: { kind: "exile", scope: "player", playerId: "player-2" },
      count: 4,
      objectIds: ["e1", "e2", "e3", "e4"]
    },
    { zoneRef: { kind: "library", scope: "shared" }, count: 40 },
    { zoneRef: { kind: "stack", scope: "shared" }, count: 1, objectIds: ["spell-1"] }
  ];
}

describe("ZonesSummaryPanel", () => {
  it("renders grouped viewer, opponent, and shared zone counts", () => {
    const html = renderToStaticMarkup(
      <ZonesSummaryPanel viewerPlayerId="player-1" zones={createZones()} />
    );

    expect(html).toContain("Your zones");
    expect(html).toContain("<span>Battlefield</span><strong>3</strong>");
    expect(html).toContain("<span>Graveyard</span><strong>1</strong>");
    expect(html).toContain("Opponent zones");
    expect(html).toContain("<span>Battlefield</span><strong>2</strong>");
    expect(html).toContain("<span>Exile</span><strong>4</strong>");
    expect(html).toContain("Shared zones");
    expect(html).toContain("<span>Library</span><strong>40</strong>");
    expect(html).toContain("<span>Stack</span><strong>1</strong>");
  });

  it("renders zero counts for missing zones instead of omitting them", () => {
    const html = renderToStaticMarkup(
      <ZonesSummaryPanel
        viewerPlayerId="player-1"
        zones={[{ zoneRef: { kind: "library", scope: "shared" }, count: 0 }]}
      />
    );

    expect(html).toContain("<span>Battlefield</span><strong>0</strong>");
    expect(html).toContain("<span>Graveyard</span><strong>0</strong>");
    expect(html).toContain("<span>Exile</span><strong>0</strong>");
    expect(html).toContain("<span>Library</span><strong>0</strong>");
    expect(html).toContain("<span>Stack</span><strong>0</strong>");
  });
});
