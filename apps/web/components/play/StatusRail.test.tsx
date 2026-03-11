import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { StatusRail } from "./StatusRail";

function baseProps() {
  return {
    viewerPlayerId: "player-1",
    turnState: {
      phase: "MAIN_1" as const,
      activePlayerId: "player-1",
      priorityPlayerId: "player-2"
    },
    viewerLife: 20,
    opponentLife: 17
  };
}

describe("StatusRail", () => {
  it("maps supported phase names into readable labels", () => {
    const html = renderToStaticMarkup(<StatusRail {...baseProps()} />);

    expect(html).toContain("Main 1");
    expect(html).toContain("<span>Priority</span><strong>Opponent</strong>");
    expect(html).toContain("<span>Active player</span><strong>You</strong>");
  });

  it("renders opponent-turn and life-total states", () => {
    const html = renderToStaticMarkup(
      <StatusRail
        {...baseProps()}
        turnState={{
          phase: "DECLARE_ATTACKERS",
          activePlayerId: "player-2",
          priorityPlayerId: "player-2"
        }}
        viewerLife={8}
        opponentLife={14}
      />
    );

    expect(html).toContain("Declare Attackers");
    expect(html).toContain("<span>Active player</span><strong>Opponent</strong>");
    expect(html).toContain("<span>Priority</span><strong>Opponent</strong>");
    expect(html).toContain("<span>You</span><strong>8</strong>");
    expect(html).toContain("<span>Opponent</span><strong>14</strong>");
  });
});
