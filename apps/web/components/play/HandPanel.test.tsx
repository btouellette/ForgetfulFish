// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { HandPanel } from "./HandPanel";

function createHandCard(
  id: string,
  cardDefId: string,
  extra?: Partial<Pick<PlayerGameView["viewer"]["hand"][number], "name" | "manaCost" | "rulesText">>
): PlayerGameView["viewer"]["hand"][number] {
  return {
    id,
    zcc: 0,
    cardDefId,
    name: cardDefId,
    manaCost: {},
    rulesText: "",
    owner: "player-1",
    controller: "player-1",
    counters: {},
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    zone: { kind: "hand", scope: "player", playerId: "player-1" },
    ...extra
  };
}

function createLegalActions(
  actions: PlayerGameView["legalActions"]["hand"] = {}
): PlayerGameView["legalActions"]["hand"] {
  return actions;
}

describe("HandPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  it("renders viewer hand cards", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <HandPanel
          hand={[createHandCard("obj-1", "island"), createHandCard("obj-2", "brainstorm")]}
          legalActions={createLegalActions({
            "obj-1": [{ type: "PLAY_LAND", command: { type: "PLAY_LAND", cardId: "obj-1" } }],
            "obj-2": [
              {
                type: "CAST_SPELL",
                commandBase: { type: "CAST_SPELL", cardId: "obj-2" },
                requiresTargets: false,
                availableModes: []
              }
            ]
          })}
          viewerHasPriority={true}
          isSubmitting={false}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onBeginTargetedCast={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("island");
    expect(container.textContent).toContain("brainstorm");
  });

  it("renders card name, mana cost, and rules text when provided", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <HandPanel
          hand={[
            createHandCard("obj-1", "island", {
              name: "Island",
              manaCost: {},
              rulesText: "Basic Land - Island"
            }),
            createHandCard("obj-2", "brainstorm", {
              name: "Brainstorm",
              manaCost: { blue: 1 },
              rulesText:
                "Draw three cards, then put two cards from your hand on top of your library in any order."
            })
          ]}
          legalActions={createLegalActions()}
          viewerHasPriority={true}
          isSubmitting={false}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onBeginTargetedCast={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("Island");
    expect(container.textContent).toContain("Basic Land - Island");
    expect(container.textContent).toContain("Brainstorm");
    expect(container.textContent).toContain("{U}");
    expect(container.textContent).toContain(
      "Draw three cards, then put two cards from your hand on top of your library in any order."
    );
  });

  it("submits PLAY_LAND intent when land action is clicked", () => {
    const onPlayLand = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <HandPanel
          hand={[createHandCard("obj-1", "island")]}
          legalActions={createLegalActions({
            "obj-1": [{ type: "PLAY_LAND", command: { type: "PLAY_LAND", cardId: "obj-1" } }]
          })}
          viewerHasPriority={true}
          isSubmitting={false}
          onPlayLand={onPlayLand}
          onCastSpell={vi.fn()}
          onBeginTargetedCast={vi.fn()}
        />
      );
    });

    const playButton = container.querySelector(
      '[data-testid="play-land-obj-1"]'
    ) as HTMLButtonElement | null;
    expect(playButton).toBeTruthy();

    act(() => {
      playButton?.click();
    });

    expect(onPlayLand).toHaveBeenCalledWith("obj-1");
  });

  it("submits CAST_SPELL intent when cast action is clicked", () => {
    const onCastSpell = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <HandPanel
          hand={[createHandCard("obj-2", "brainstorm")]}
          legalActions={createLegalActions({
            "obj-2": [
              {
                type: "CAST_SPELL",
                commandBase: { type: "CAST_SPELL", cardId: "obj-2" },
                requiresTargets: false,
                availableModes: []
              }
            ]
          })}
          viewerHasPriority={true}
          isSubmitting={false}
          onPlayLand={vi.fn()}
          onCastSpell={onCastSpell}
          onBeginTargetedCast={vi.fn()}
        />
      );
    });

    const castButton = container.querySelector(
      '[data-testid="cast-spell-obj-2"]'
    ) as HTMLButtonElement | null;
    expect(castButton).toBeTruthy();

    act(() => {
      castButton?.click();
    });

    expect(onCastSpell).toHaveBeenCalledWith("obj-2");
  });

  it("starts target selection for cards that require a target", () => {
    const onBeginTargetedCast = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <HandPanel
          hand={[createHandCard("obj-3", "memory-lapse")]}
          legalActions={createLegalActions({
            "obj-3": [
              {
                type: "CAST_SPELL",
                commandBase: { type: "CAST_SPELL", cardId: "obj-3" },
                requiresTargets: true,
                availableModes: []
              }
            ]
          })}
          viewerHasPriority={true}
          isSubmitting={false}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onBeginTargetedCast={onBeginTargetedCast}
        />
      );
    });

    const targetedCastButton = container.querySelector(
      '[data-testid="cast-spell-targeted-obj-3"]'
    ) as HTMLButtonElement | null;
    expect(targetedCastButton).toBeTruthy();
    expect(targetedCastButton?.disabled).toBe(false);

    act(() => {
      targetedCastButton?.click();
    });

    expect(onBeginTargetedCast).toHaveBeenCalledWith("obj-3");
  });

  it("disables hand actions while command submission is in progress", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <HandPanel
          hand={[createHandCard("obj-1", "island"), createHandCard("obj-2", "brainstorm")]}
          legalActions={createLegalActions({
            "obj-1": [{ type: "PLAY_LAND", command: { type: "PLAY_LAND", cardId: "obj-1" } }],
            "obj-2": [
              {
                type: "CAST_SPELL",
                commandBase: { type: "CAST_SPELL", cardId: "obj-2" },
                requiresTargets: false,
                availableModes: []
              }
            ]
          })}
          viewerHasPriority={true}
          isSubmitting={true}
          onPlayLand={vi.fn()}
          onCastSpell={vi.fn()}
          onBeginTargetedCast={vi.fn()}
        />
      );
    });

    const playButton = container.querySelector(
      '[data-testid="play-land-obj-1"]'
    ) as HTMLButtonElement | null;
    const castButton = container.querySelector(
      '[data-testid="cast-spell-obj-2"]'
    ) as HTMLButtonElement | null;

    expect(playButton?.disabled).toBe(true);
    expect(castButton?.disabled).toBe(true);
  });
});
