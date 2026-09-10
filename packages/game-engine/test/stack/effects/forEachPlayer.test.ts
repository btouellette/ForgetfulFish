import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CardDefinition } from "../../../src/cards/cardDefinition";
import { cardRegistry, islandCardDefinition } from "../../../src/cards";
import type { ResolveEffectNode } from "../../../src/cards/resolveEffect";
import { Rng } from "../../../src/rng/rng";
import { resolveTopOfStack, type ResolveStackResult } from "../../../src/stack/resolve";
import type { StackItem } from "../../../src/stack/stackItem";
import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../../src/state/gameState";
import { zoneKey } from "../../../src/state/zones";
import { assertStateInvariants } from "../../helpers/invariants";

const CARD_ID = "for-each-player-test-card";

function makeCardDefinition(onResolve: ResolveEffectNode[]): CardDefinition {
  return {
    id: CARD_ID,
    name: "For Each Player Test Card",
    manaCost: { blue: 1 },
    typeLine: ["Instant"],
    subtypes: [],
    color: ["blue"],
    supertypes: [],
    power: null,
    toughness: null,
    keywords: [],
    staticAbilities: [],
    triggeredAbilities: [],
    activatedAbilities: [],
    onResolve,
    continuousEffects: [],
    replacementEffects: []
  };
}

function buildState(activePlayerId: "p1" | "p2" = "p1"): GameState {
  const state = createInitialGameState("p1", "p2", {
    id: "for-each-player",
    rngSeed: "for-each-player-seed"
  });
  state.turnState.activePlayerId = activePlayerId;

  const spell: GameObject = {
    id: "obj-spell",
    zcc: 0,
    cardDefId: CARD_ID,
    owner: "p1",
    controller: "p1",
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "stack", scope: "shared" }
  };
  state.objectPool.set(spell.id, spell);
  state.zones.set(zoneKey(state.mode.resolveZone(state, "stack", "p1")), [spell.id]);

  const libraryIds: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const card: GameObject = {
      ...spell,
      id: `obj-library-${index}`,
      cardDefId: islandCardDefinition.id,
      zone: { kind: "library", scope: "shared" }
    };
    state.objectPool.set(card.id, card);
    libraryIds.push(card.id);
  }
  state.zones.set(zoneKey(state.mode.resolveZone(state, "library", "p1")), libraryIds);

  const stackItem: StackItem = {
    id: "stack-item-1",
    object: { id: spell.id, zcc: spell.zcc },
    controller: "p1",
    targets: [],
    effectContext: {
      stackItemId: "stack-item-1",
      source: { id: spell.id, zcc: spell.zcc },
      controller: "p1",
      targets: [],
      cursor: { kind: "start" },
      whiteboard: { actions: [], scratch: {} }
    }
  };
  state.stack = [stackItem];

  return state;
}

function resolveWith(
  onResolve: ResolveEffectNode[],
  activePlayerId: "p1" | "p2" = "p1"
): ResolveStackResult {
  cardRegistry.set(CARD_ID, makeCardDefinition(onResolve));
  const state = buildState(activePlayerId);
  return resolveTopOfStack(state, new Rng(state.rngSeed));
}

const drawOneForIterationPlayer: ResolveEffectNode = {
  kind: "draw_cards",
  count: 1,
  player: "iteration_player"
};

const chooseMode: ResolveEffectNode = {
  kind: "choose_mode",
  prompt: "Choose a mode",
  storeKey: "iteration:mode",
  modeSource: { kind: "explicit", modes: [{ id: "mode-a" }, { id: "mode-b" }] }
};

describe("stack/effects/for_each_player", () => {
  beforeEach(() => {
    cardRegistry.set(islandCardDefinition.id, islandCardDefinition);
  });

  afterEach(() => {
    cardRegistry.delete(CARD_ID);
  });

  it("runs the body once per player and binds the iteration player", () => {
    const result = resolveWith([
      {
        kind: "for_each_player",
        order: "controller_first",
        body: drawOneForIterationPlayer
      }
    ]);

    expect(result.state.players[0].hand).toHaveLength(1);
    expect(result.state.players[1].hand).toHaveLength(1);
    expect(() => assertStateInvariants(result.state)).not.toThrow();
  });

  it("iterates the controller first under controller_first order", () => {
    const result = resolveWith(
      [
        {
          kind: "for_each_player",
          order: "controller_first",
          body: drawOneForIterationPlayer
        }
      ],
      "p2"
    );

    const drawOrder = result.events
      .filter((event) => event.type === "CARD_DRAWN")
      .map((event) => (event as unknown as { playerId: string }).playerId);
    expect(drawOrder).toEqual(["p1", "p2"]);
  });

  it("iterates the active player first under apnap order", () => {
    const result = resolveWith(
      [
        {
          kind: "for_each_player",
          order: "apnap",
          body: drawOneForIterationPlayer
        }
      ],
      "p2"
    );

    const drawOrder = result.events
      .filter((event) => event.type === "CARD_DRAWN")
      .map((event) => (event as unknown as { playerId: string }).playerId);
    expect(drawOrder).toEqual(["p2", "p1"]);
  });

  it("records the iteration index in the resume path when the body pauses", () => {
    const result = resolveWith([
      {
        kind: "for_each_player",
        order: "controller_first",
        body: { kind: "sequence", children: [drawOneForIterationPlayer, chooseMode] }
      }
    ]);

    expect(result.pendingChoice?.type).toBe("CHOOSE_MODE");
    const top = result.state.stack[result.state.stack.length - 1];
    expect(top?.effectContext.cursor).toEqual({
      kind: "waiting_choice",
      choiceId: result.pendingChoice?.id,
      resumePath: [0, 0, 1],
      phase: "effects"
    });
  });

  it("resumes the paused iteration and then pauses again for the next player", () => {
    const paused = resolveWith([
      {
        kind: "for_each_player",
        order: "controller_first",
        body: { kind: "sequence", children: [chooseMode, drawOneForIterationPlayer] }
      }
    ]);

    const pausedTop = paused.state.stack[paused.state.stack.length - 1];
    if (pausedTop === undefined || paused.pendingChoice === null) {
      throw new Error("expected a paused stack item");
    }

    const resumedState: GameState = {
      ...paused.state,
      pendingChoice: null,
      stack: [
        {
          ...pausedTop,
          effectContext: {
            ...pausedTop.effectContext,
            cursor: { kind: "node", path: [0, 0, 0], phase: "effects" },
            whiteboard: {
              ...pausedTop.effectContext.whiteboard,
              scratch: {
                ...pausedTop.effectContext.whiteboard.scratch,
                [`choice:${paused.pendingChoice.id}`]: {
                  type: "CHOOSE_MODE",
                  mode: { id: "mode-a" }
                }
              }
            }
          }
        }
      ]
    };

    const resumed = resolveTopOfStack(resumedState, new Rng(resumedState.rngSeed));

    expect(resumed.pendingChoice?.type).toBe("CHOOSE_MODE");
    expect(resumed.pendingChoice?.id).not.toBe(paused.pendingChoice.id);
    const resumedTop = resumed.state.stack[resumed.state.stack.length - 1];
    expect(resumedTop?.effectContext.cursor).toEqual({
      kind: "waiting_choice",
      choiceId: resumed.pendingChoice?.id,
      resumePath: [0, 1, 0],
      phase: "effects"
    });
  });

  it("does not leak scratch written by one iteration into the next", () => {
    const paused = resolveWith([
      {
        kind: "for_each_player",
        order: "controller_first",
        body: {
          kind: "sequence",
          children: [
            chooseMode,
            {
              kind: "conditional",
              if: { kind: "mode_equals", storeKey: "iteration:mode", modeId: "mode-a" },
              then: drawOneForIterationPlayer
            }
          ]
        }
      }
    ]);

    const pausedTop = paused.state.stack[paused.state.stack.length - 1];
    if (pausedTop === undefined || paused.pendingChoice === null) {
      throw new Error("expected a paused stack item");
    }

    const resumedState: GameState = {
      ...paused.state,
      pendingChoice: null,
      stack: [
        {
          ...pausedTop,
          effectContext: {
            ...pausedTop.effectContext,
            cursor: { kind: "node", path: [0, 0, 0], phase: "effects" },
            whiteboard: {
              ...pausedTop.effectContext.whiteboard,
              scratch: {
                ...pausedTop.effectContext.whiteboard.scratch,
                [`choice:${paused.pendingChoice.id}`]: {
                  type: "CHOOSE_MODE",
                  mode: { id: "mode-a" }
                }
              }
            }
          }
        }
      ]
    };

    const resumed = resolveTopOfStack(resumedState, new Rng(resumedState.rngSeed));
    const resumedTop = resumed.state.stack[resumed.state.stack.length - 1];

    expect(resumed.pendingChoice?.type).toBe("CHOOSE_MODE");
    expect(resumedTop?.effectContext.whiteboard.scratch["iteration:mode"]).toBeUndefined();
  });
});
