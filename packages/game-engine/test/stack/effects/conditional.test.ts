import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CardDefinition } from "../../../src/cards/cardDefinition";
import { cardRegistry, islandCardDefinition } from "../../../src/cards";
import type { ResolveEffectNode } from "../../../src/cards/resolveEffect";
import { Rng } from "../../../src/rng/rng";
import { evaluateResolveCondition } from "../../../src/stack/effects/conditions";
import { resolveTopOfStack, type ResolveStackResult } from "../../../src/stack/resolve";
import type { StackItem } from "../../../src/stack/stackItem";
import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../../src/state/gameState";
import { zoneKey } from "../../../src/state/zones";

const CARD_ID = "conditional-test-card";

function makeCardDefinition(onResolve: ResolveEffectNode[]): CardDefinition {
  return {
    id: CARD_ID,
    name: "Conditional Test Card",
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

function buildState(scratch: Record<string, unknown> = {}): GameState {
  const state = createInitialGameState("p1", "p2", {
    id: "conditional",
    rngSeed: "conditional-seed"
  });

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
  for (let index = 0; index < 6; index += 1) {
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
      whiteboard: { actions: [], scratch }
    }
  };
  state.stack = [stackItem];

  return state;
}

function resolveWith(
  onResolve: ResolveEffectNode[],
  scratch: Record<string, unknown> = {}
): ResolveStackResult {
  cardRegistry.set(CARD_ID, makeCardDefinition(onResolve));
  const state = buildState(scratch);
  return resolveTopOfStack(state, new Rng(state.rngSeed));
}

const drawOne: ResolveEffectNode = { kind: "draw_cards", count: 1, player: "controller" };

describe("stack/effects/conditional", () => {
  beforeEach(() => {
    cardRegistry.set(islandCardDefinition.id, islandCardDefinition);
  });

  afterEach(() => {
    cardRegistry.delete(CARD_ID);
  });

  it("executes the then branch and skips the else branch when the condition holds", () => {
    const result = resolveWith(
      [
        {
          kind: "conditional",
          if: { kind: "scratch_present", key: "flag" },
          then: { kind: "sequence", children: [drawOne, drawOne] },
          else: drawOne
        }
      ],
      { flag: true }
    );

    expect(result.state.players[0].hand).toHaveLength(2);
  });

  it("executes the else branch when the condition does not hold", () => {
    const result = resolveWith([
      {
        kind: "conditional",
        if: { kind: "scratch_present", key: "flag" },
        then: { kind: "sequence", children: [drawOne, drawOne] },
        else: drawOne
      }
    ]);

    expect(result.state.players[0].hand).toHaveLength(1);
  });

  it("continues without error when a false condition has no else branch", () => {
    const result = resolveWith([
      {
        kind: "conditional",
        if: { kind: "scratch_present", key: "flag" },
        then: drawOne
      },
      drawOne
    ]);

    expect(result.state.players[0].hand).toHaveLength(1);
    expect(result.pendingChoice).toBeNull();
  });

  it("walks nested sequences depth-first in declaration order", () => {
    const result = resolveWith(
      [
        {
          kind: "sequence",
          children: [
            {
              kind: "sequence",
              children: [
                { kind: "name_card", prompt: "Name a card", storeKey: "conditional:named" },
                {
                  kind: "choose_mode",
                  prompt: "Choose a mode",
                  storeKey: "conditional:mode",
                  modeSource: { kind: "explicit", modes: [{ id: "mode-a" }] }
                }
              ]
            }
          ]
        }
      ],
      { flag: true }
    );

    expect(result.pendingChoice?.type).toBe("NAME_CARD");
    const top = result.state.stack[result.state.stack.length - 1];
    expect(top?.effectContext.cursor).toEqual({
      kind: "waiting_choice",
      choiceId: result.pendingChoice?.id,
      resumePath: [0, 0, 0],
      phase: "effects"
    });
  });

  it("records a resume path inside the branch when an effect pauses there", () => {
    const result = resolveWith(
      [
        drawOne,
        {
          kind: "conditional",
          if: { kind: "scratch_present", key: "flag" },
          then: {
            kind: "sequence",
            children: [
              drawOne,
              {
                kind: "choose_mode",
                prompt: "Choose a mode",
                storeKey: "conditional:mode",
                modeSource: { kind: "explicit", modes: [{ id: "mode-a" }, { id: "mode-b" }] }
              }
            ]
          }
        }
      ],
      { flag: true }
    );

    expect(result.pendingChoice?.type).toBe("CHOOSE_MODE");
    const top = result.state.stack[result.state.stack.length - 1];
    expect(top?.effectContext.cursor).toEqual({
      kind: "waiting_choice",
      choiceId: result.pendingChoice?.id,
      resumePath: [1, 0, 1],
      phase: "effects"
    });
  });

  it("resumes inside the branch rather than at the conditional", () => {
    const paused = resolveWith(
      [
        {
          kind: "conditional",
          if: { kind: "scratch_present", key: "flag" },
          then: {
            kind: "sequence",
            children: [
              drawOne,
              {
                kind: "choose_mode",
                prompt: "Choose a mode",
                storeKey: "conditional:mode",
                modeSource: { kind: "explicit", modes: [{ id: "mode-a" }, { id: "mode-b" }] }
              },
              drawOne
            ]
          }
        }
      ],
      { flag: true }
    );

    const pausedTop = paused.state.stack[paused.state.stack.length - 1];
    if (pausedTop === undefined || paused.pendingChoice === null) {
      throw new Error("expected a paused stack item");
    }

    const handWhilePaused = paused.state.players[0].hand.length;
    const resumedState: GameState = {
      ...paused.state,
      pendingChoice: null,
      stack: [
        {
          ...pausedTop,
          effectContext: {
            ...pausedTop.effectContext,
            cursor: { kind: "node", path: [0, 0, 1], phase: "effects" },
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

    expect(resumed.pendingChoice).toBeNull();
    expect(resumed.state.players[0].hand).toHaveLength(handWhilePaused + 1);
  });
});

describe("stack/effects/conditions", () => {
  const objectPool = new Map<string, GameObject>([
    [
      "obj-island",
      {
        id: "obj-island",
        zcc: 0,
        cardDefId: islandCardDefinition.id,
        owner: "p1",
        controller: "p1",
        counters: new Map(),
        damage: 0,
        tapped: false,
        summoningSick: false,
        attachments: [],
        abilities: [],
        zone: { kind: "graveyard", scope: "shared" }
      }
    ]
  ]);

  beforeEach(() => {
    cardRegistry.set(islandCardDefinition.id, islandCardDefinition);
  });

  it("reports named_card_among as true when a listed card carries the named card's name", () => {
    expect(
      evaluateResolveCondition(
        { kind: "named_card_among", nameKey: "named", cardsKey: "cards" },
        {
          scratch: { named: " island ", cards: ["obj-island"] },
          objectPool
        }
      )
    ).toBe(true);
  });

  it("reports named_card_among as false when no listed card matches the named card", () => {
    expect(
      evaluateResolveCondition(
        { kind: "named_card_among", nameKey: "named", cardsKey: "cards" },
        {
          scratch: { named: "Brainstorm", cards: ["obj-island"] },
          objectPool
        }
      )
    ).toBe(false);
  });

  it("compares a stored mode id against the expected mode", () => {
    expect(
      evaluateResolveCondition(
        { kind: "mode_equals", storeKey: "mode", modeId: "mode-a" },
        { scratch: { mode: "mode-a" }, objectPool }
      )
    ).toBe(true);
    expect(
      evaluateResolveCondition(
        { kind: "mode_equals", storeKey: "mode", modeId: "mode-b" },
        { scratch: { mode: "mode-a" }, objectPool }
      )
    ).toBe(false);
  });

  it("treats an absent scratch key as not present", () => {
    expect(
      evaluateResolveCondition(
        { kind: "scratch_present", key: "missing" },
        { scratch: {}, objectPool }
      )
    ).toBe(false);
  });
});
