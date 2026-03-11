import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { ZonesSummaryPanel } from "./ZonesSummaryPanel";

function createZones(): PlayerGameView["zones"] {
  return [
    {
      zoneRef: { kind: "hand", scope: "player", playerId: "player-1" },
      count: 3,
      objectIds: ["a", "b", "c"]
    },
    {
      zoneRef: { kind: "hand", scope: "player", playerId: "player-2" },
      count: 2
    },
    {
      zoneRef: { kind: "battlefield", scope: "shared" },
      count: 5,
      objectIds: ["bf-1", "bf-2", "bf-3", "bf-4", "bf-5"]
    },
    {
      zoneRef: { kind: "graveyard", scope: "shared" },
      count: 1,
      objectIds: ["g1"]
    },
    {
      zoneRef: { kind: "exile", scope: "shared" },
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
    expect(html).toContain("<span>Hand</span><strong>3</strong>");
    expect(html).toContain("Opponent zones");
    expect(html).toContain("<span>Hand</span><strong>2</strong>");
    expect(html).toContain("Shared zones");
    expect(html).toContain("<span>Battlefield</span><strong>5</strong>");
    expect(html).toContain("<span>Graveyard</span><strong>1</strong>");
    expect(html).toContain("<span>Exile</span><strong>4</strong>");
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

    expect(html).toContain("<span>Hand</span><strong>0</strong>");
    expect(html).toContain("<span>Battlefield</span><strong>0</strong>");
    expect(html).toContain("<span>Graveyard</span><strong>0</strong>");
    expect(html).toContain("<span>Exile</span><strong>0</strong>");
    expect(html).toContain("<span>Library</span><strong>0</strong>");
    expect(html).toContain("<span>Stack</span><strong>0</strong>");
  });
});
