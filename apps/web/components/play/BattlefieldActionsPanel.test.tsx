// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { BattlefieldActionsPanel } from "./BattlefieldActionsPanel";

function createObjectView(
  id: string,
  cardDefId: string,
  name?: string
): PlayerGameView["objectPool"][string] {
  return {
    id,
    zcc: 0,
    cardDefId,
    name: name ?? cardDefId,
    owner: "player-1",
    controller: "player-1",
    counters: {},
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    zone: { kind: "battlefield", scope: "shared" }
  };
}

describe("BattlefieldActionsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  it("renders battlefield actions with card names instead of raw IDs", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <BattlefieldActionsPanel
          legalActions={{
            "obj-1": [
              {
                type: "ACTIVATE_ABILITY",
                commandBase: { type: "ACTIVATE_ABILITY", sourceId: "obj-1", abilityIndex: 0 },
                requiresTargets: false,
                isManaAbility: false,
                manaProduced: null,
                blocksAutoPass: true
              }
            ],
            "obj-2": [
              {
                type: "ACTIVATE_ABILITY",
                commandBase: { type: "ACTIVATE_ABILITY", sourceId: "obj-2", abilityIndex: 0 },
                requiresTargets: true,
                isManaAbility: false,
                manaProduced: null,
                blocksAutoPass: true
              }
            ]
          }}
          objectPool={{
            "obj-1": createObjectView("obj-1", "island", "Island"),
            "obj-2": createObjectView("obj-2", "prodigal-sorcerer", "Prodigal Sorcerer")
          }}
          viewerHasPriority={true}
          isSubmitting={false}
          onActivateAbility={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("Island");
    expect(container.textContent).toContain("Prodigal Sorcerer");
    expect(container.textContent).not.toContain("obj-1");
    expect(container.textContent).not.toContain("obj-2");
  });
});
