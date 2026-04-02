import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { addContinuousEffect, LAYERS } from "../../src/effects/continuous/layers";
import {
  createInitialGameState,
  projectPlayerView,
  zoneKey,
  type GameObject,
  type GameState,
  type PendingChoice,
  type PlayerId,
  type ZoneRef
} from "../../src/index";

function createObject(
  id: string,
  owner: PlayerId,
  zone: ZoneRef,
  overrides: Partial<GameObject> = {}
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: `${id}-card`,
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone,
    ...overrides
  };
}

function addObject(state: GameState, object: GameObject): void {
  state.objectPool.set(object.id, object);
  const zoneEntries = state.zones.get(zoneKey(object.zone));

  if (!zoneEntries) {
    throw new Error(`Zone not initialized for object ${object.id}`);
  }

  zoneEntries.push(object.id);

  const zone = object.zone;

  if (zone.kind === "hand") {
    if (zone.scope !== "player") {
      throw new Error("hand zone must be player scoped");
    }

    const player = state.players.find((entry) => entry.id === zone.playerId);

    if (!player) {
      throw new Error(`Player ${zone.playerId} not initialized for object ${object.id}`);
    }

    player.hand.push(object.id);
  }
}

function withTemporaryCardDefinitions(definitions: CardDefinition[], callback: () => void): void {
  const previousDefinitions = definitions.map(
    (definition) => [definition.id, cardRegistry.get(definition.id)] as const
  );

  try {
    for (const definition of definitions) {
      cardRegistry.set(definition.id, definition);
    }

    callback();
  } finally {
    for (const [definitionId, previousDefinition] of previousDefinitions) {
      if (previousDefinition === undefined) {
        cardRegistry.delete(definitionId);
      } else {
        cardRegistry.set(definitionId, previousDefinition);
      }
    }
  }
}

const combatTestCreatureDefinition: CardDefinition = {
  id: "projection-combat-test-creature",
  name: "Projection Combat Test Creature",
  manaCost: { blue: 1 },
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Fish" }],
  color: ["blue"],
  supertypes: [],
  power: 1,
  toughness: 1,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

const blueRedSpellDefinition: CardDefinition = {
  id: "projection-blue-red-spell",
  name: "Projection Blue Red Spell",
  manaCost: { blue: 2, red: 1 },
  rulesText: "Draw two cards.",
  typeLine: ["Instant"],
  subtypes: [],
  color: ["blue", "red"],
  supertypes: [],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

const dualManaLandDefinition: CardDefinition = {
  id: "projection-dual-land",
  name: "Projection Dual Land",
  manaCost: {},
  rulesText: "{T}: Add {U} or {R}.",
  typeLine: ["Land"],
  subtypes: [],
  color: [],
  supertypes: [],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [
    {
      kind: "activated",
      cost: [{ kind: "tap" }],
      effect: { kind: "add_mana", mana: { red: 1 } },
      isManaAbility: true
    },
    {
      kind: "activated",
      cost: [{ kind: "tap" }],
      effect: { kind: "add_mana", mana: { blue: 1 } },
      isManaAbility: true
    }
  ],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

function createStateWithVisibleAndHiddenObjects(): GameState {
  const state = createInitialGameState("p1", "p2", {
    id: "projection-test",
    rngSeed: "projection-seed"
  });

  addObject(
    state,
    createObject(
      "viewer-hand",
      "p1",
      { kind: "hand", scope: "player", playerId: "p1" },
      {
        cardDefId: "brainstorm"
      }
    )
  );
  addObject(
    state,
    createObject(
      "opponent-hand",
      "p2",
      { kind: "hand", scope: "player", playerId: "p2" },
      {
        cardDefId: "memory-lapse"
      }
    )
  );
  addObject(
    state,
    createObject(
      "library-card",
      "p1",
      { kind: "library", scope: "shared" },
      { cardDefId: "predict" }
    )
  );
  addObject(
    state,
    createObject(
      "battlefield-card",
      "p1",
      { kind: "battlefield", scope: "shared" },
      {
        cardDefId: "island"
      }
    )
  );
  addObject(
    state,
    createObject(
      "graveyard-card",
      "p2",
      { kind: "graveyard", scope: "shared" },
      {
        cardDefId: "accumulated-knowledge"
      }
    )
  );
  addObject(
    state,
    createObject(
      "exile-card",
      "p1",
      { kind: "exile", scope: "shared" },
      { cardDefId: "mystical-tutor" }
    )
  );
  addObject(
    state,
    createObject("stack-card", "p1", { kind: "stack", scope: "shared" }, { cardDefId: "predict" })
  );

  state.stack.push({
    id: "stack-item-1",
    object: { id: "stack-card", zcc: 0 },
    controller: "p1",
    targets: [],
    effectContext: {
      stackItemId: "stack-item-1",
      source: { id: "stack-card", zcc: 0 },
      controller: "p1",
      targets: [],
      cursor: { kind: "start" },
      whiteboard: { actions: [], scratch: {} }
    }
  });

  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.priorityState.playerWithPriority = "p2";
  state.lkiStore.set("viewer-hand:0", {
    ref: { id: "viewer-hand", zcc: 0 },
    zone: { kind: "hand", scope: "player", playerId: "p1" },
    base: state.objectPool.get("viewer-hand")!,
    derived: state.objectPool.get("viewer-hand")!
  });
  state.triggerQueue.push({ id: "trigger-1" });

  const choice: PendingChoice = {
    id: "choice-1",
    type: "CHOOSE_YES_NO",
    forPlayer: "p1",
    prompt: "Respond?",
    constraints: { prompt: "Respond?" }
  };
  state.pendingChoice = choice;

  return state;
}

describe("view/projection", () => {
  it("shows the viewer their own hand card details", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");

    expect(view.viewer.hand).toHaveLength(1);
    expect(view.viewer.hand[0]?.id).toBe("viewer-hand");
    expect(view.viewer.hand[0]?.name).toBe("Brainstorm");
    expect(view.viewer.hand[0]?.manaCost).toEqual({ blue: 1 });
    expect(view.viewer.hand[0]?.rulesText).toBe(
      "Draw three cards, then put two cards from your hand on top of your library in any order."
    );
    expect(view.objectPool["viewer-hand"]?.cardDefId).toBe("brainstorm");
  });

  it("hides opponent hand identities and only exposes the count", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");

    expect(view.opponent.handCount).toBe(1);
    expect(view.objectPool["opponent-hand"]).toBeUndefined();
    expect(view.viewer.hand.some((card) => card.id === "opponent-hand")).toBe(false);
  });

  it("hides shared library identities while keeping the count", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");
    const libraryZone = view.zones.find(
      (entry) => entry.zoneRef.kind === "library" && entry.zoneRef.scope === "shared"
    );

    expect(libraryZone?.count).toBe(1);
    expect(libraryZone?.objectIds).toBeUndefined();
    expect(view.objectPool["library-card"]).toBeUndefined();
  });

  it("includes battlefield, graveyard, exile, and stack objects in public views", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");

    expect(view.objectPool["battlefield-card"]?.zone.kind).toBe("battlefield");
    expect(view.objectPool["graveyard-card"]?.zone.kind).toBe("graveyard");
    expect(view.objectPool["exile-card"]?.zone.kind).toBe("exile");
    expect(view.objectPool["stack-card"]?.zone.kind).toBe("stack");
    expect(view.stack).toEqual([{ object: { id: "stack-card", zcc: 0 }, controller: "p1" }]);
  });

  it("projects compact legal actions for hand and battlefield sources", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "projection-legal-actions",
      rngSeed: "projection-legal-actions-seed"
    });

    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState.playerWithPriority = "p1";
    state.players[0].priority = true;
    state.players[1].priority = false;
    state.players[0].manaPool.blue = 1;

    addObject(
      state,
      createObject(
        "hand-island",
        "p1",
        { kind: "hand", scope: "player", playerId: "p1" },
        {
          cardDefId: "island"
        }
      )
    );
    addObject(
      state,
      createObject(
        "hand-brainstorm",
        "p1",
        { kind: "hand", scope: "player", playerId: "p1" },
        { cardDefId: "brainstorm" }
      )
    );
    addObject(
      state,
      createObject(
        "battlefield-island",
        "p1",
        { kind: "battlefield", scope: "shared" },
        {
          cardDefId: "island"
        }
      )
    );

    const view = projectPlayerView(state, "p1");

    expect(view.legalActions.passPriority).toEqual({ command: { type: "PASS_PRIORITY" } });
    expect(view.legalActions.concede).toEqual({ command: { type: "CONCEDE" } });
    expect(view.legalActions.hand["hand-island"]).toEqual([
      { type: "PLAY_LAND", command: { type: "PLAY_LAND", cardId: "hand-island" } }
    ]);
    expect(view.legalActions.hand["hand-brainstorm"]).toEqual([
      {
        type: "CAST_SPELL",
        commandBase: { type: "CAST_SPELL", cardId: "hand-brainstorm" },
        requiresTargets: false,
        availableModes: []
      }
    ]);
    expect(view.legalActions.battlefield["battlefield-island"]).toEqual([
      {
        type: "ACTIVATE_ABILITY",
        commandBase: {
          type: "ACTIVATE_ABILITY",
          sourceId: "battlefield-island",
          abilityIndex: 0
        },
        requiresTargets: false,
        isManaAbility: true,
        manaProduced: { blue: 1 },
        blocksAutoPass: true
      }
    ]);
    expect(view.legalActions.hasOtherBlockingActions).toBe(false);
  });

  it("projects computed controller and legal actions for continuously stolen permanents", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "projection-derived-controller",
      rngSeed: "projection-derived-controller-seed"
    });

    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState.playerWithPriority = "p1";
    state.players[0].priority = true;
    state.players[1].priority = false;

    addObject(
      state,
      createObject(
        "stolen-island",
        "p2",
        { kind: "battlefield", scope: "shared" },
        { cardDefId: "island" }
      )
    );

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-projection-stolen-island",
      source: { id: "source-projection-island", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "stolen-island", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p1" } }
    });

    const view = projectPlayerView(withControlEffect, "p1");

    expect(view.objectPool["stolen-island"]?.controller).toBe("p1");
    expect(view.legalActions.battlefield["stolen-island"]).toEqual([
      {
        type: "ACTIVATE_ABILITY",
        commandBase: {
          type: "ACTIVATE_ABILITY",
          sourceId: "stolen-island",
          abilityIndex: 0
        },
        requiresTargets: false,
        isManaAbility: true,
        manaProduced: { blue: 1 },
        blocksAutoPass: false
      }
    ]);
  });

  it("marks mana-only activations as non-blocking when total mana cannot unlock a real action", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "projection-non-blocking-mana",
      rngSeed: "projection-non-blocking-mana-seed"
    });

    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState.playerWithPriority = "p1";
    state.players[0].priority = true;
    state.players[1].priority = false;

    addObject(
      state,
      createObject(
        "battlefield-island",
        "p1",
        { kind: "battlefield", scope: "shared" },
        {
          cardDefId: "island"
        }
      )
    );

    const view = projectPlayerView(state, "p1");

    expect(view.legalActions.battlefield["battlefield-island"]).toEqual([
      {
        type: "ACTIVATE_ABILITY",
        commandBase: {
          type: "ACTIVATE_ABILITY",
          sourceId: "battlefield-island",
          abilityIndex: 0
        },
        requiresTargets: false,
        isManaAbility: true,
        manaProduced: { blue: 1 },
        blocksAutoPass: false
      }
    ]);
    expect(view.legalActions.hasOtherBlockingActions).toBe(false);
  });

  it("keeps future dual-mana lands blocking when one color choice plus other lands unlocks a spell", () => {
    withTemporaryCardDefinitions([blueRedSpellDefinition, dualManaLandDefinition], () => {
      const state = createInitialGameState("p1", "p2", {
        id: "projection-dual-mana-blocking",
        rngSeed: "projection-dual-mana-blocking-seed"
      });

      state.turnState.phase = "MAIN_1";
      state.turnState.step = "MAIN_1";
      state.turnState.activePlayerId = "p1";
      state.turnState.priorityState.playerWithPriority = "p1";
      state.players[0].priority = true;
      state.players[1].priority = false;

      addObject(
        state,
        createObject(
          "island-a",
          "p1",
          { kind: "battlefield", scope: "shared" },
          { cardDefId: "island" }
        )
      );
      addObject(
        state,
        createObject(
          "island-b",
          "p1",
          { kind: "battlefield", scope: "shared" },
          { cardDefId: "island" }
        )
      );
      addObject(
        state,
        createObject(
          "dual-land",
          "p1",
          { kind: "battlefield", scope: "shared" },
          {
            cardDefId: dualManaLandDefinition.id
          }
        )
      );
      addObject(
        state,
        createObject(
          "blue-red-spell",
          "p1",
          { kind: "hand", scope: "player", playerId: "p1" },
          {
            cardDefId: blueRedSpellDefinition.id
          }
        )
      );

      const view = projectPlayerView(state, "p1");

      expect(view.legalActions.battlefield["dual-land"]).toEqual([
        {
          type: "ACTIVATE_ABILITY",
          commandBase: {
            type: "ACTIVATE_ABILITY",
            sourceId: "dual-land",
            abilityIndex: 0
          },
          requiresTargets: false,
          isManaAbility: true,
          manaProduced: { red: 1 },
          blocksAutoPass: true
        },
        {
          type: "ACTIVATE_ABILITY",
          commandBase: {
            type: "ACTIVATE_ABILITY",
            sourceId: "dual-land",
            abilityIndex: 1
          },
          requiresTargets: false,
          isManaAbility: true,
          manaProduced: { blue: 1 },
          blocksAutoPass: true
        }
      ]);
      expect(view.legalActions.battlefield["island-a"]?.[0]?.blocksAutoPass).toBe(true);
      expect(view.legalActions.battlefield["island-b"]?.[0]?.blocksAutoPass).toBe(true);
      expect(view.legalActions.hasOtherBlockingActions).toBe(false);
    });
  });

  it("does not block auto-pass with only three islands when the spell still needs red mana", () => {
    withTemporaryCardDefinitions([blueRedSpellDefinition], () => {
      const state = createInitialGameState("p1", "p2", {
        id: "projection-three-islands-no-red",
        rngSeed: "projection-three-islands-no-red-seed"
      });

      state.turnState.phase = "MAIN_1";
      state.turnState.step = "MAIN_1";
      state.turnState.activePlayerId = "p1";
      state.turnState.priorityState.playerWithPriority = "p1";
      state.players[0].priority = true;
      state.players[1].priority = false;

      addObject(
        state,
        createObject(
          "island-a",
          "p1",
          { kind: "battlefield", scope: "shared" },
          { cardDefId: "island" }
        )
      );
      addObject(
        state,
        createObject(
          "island-b",
          "p1",
          { kind: "battlefield", scope: "shared" },
          { cardDefId: "island" }
        )
      );
      addObject(
        state,
        createObject(
          "island-c",
          "p1",
          { kind: "battlefield", scope: "shared" },
          { cardDefId: "island" }
        )
      );
      addObject(
        state,
        createObject(
          "blue-red-spell",
          "p1",
          { kind: "hand", scope: "player", playerId: "p1" },
          {
            cardDefId: blueRedSpellDefinition.id
          }
        )
      );

      const view = projectPlayerView(state, "p1");

      expect(view.legalActions.battlefield["island-a"]?.[0]?.blocksAutoPass).toBe(false);
      expect(view.legalActions.battlefield["island-b"]?.[0]?.blocksAutoPass).toBe(false);
      expect(view.legalActions.battlefield["island-c"]?.[0]?.blocksAutoPass).toBe(false);
      expect(view.legalActions.hasOtherBlockingActions).toBe(false);
    });
  });

  it("does not flag empty declare attackers windows as other blocking actions", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "projection-combat-blocking",
      rngSeed: "projection-combat-blocking-seed"
    });

    state.turnState.phase = "DECLARE_ATTACKERS";
    state.turnState.step = "DECLARE_ATTACKERS";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState.playerWithPriority = "p1";
    state.players[0].priority = true;
    state.players[1].priority = false;

    const view = projectPlayerView(state, "p1");

    expect(view.legalActions.hasOtherBlockingActions).toBe(false);
  });

  it("flags declare attackers windows when the active player has a legal attacker", () => {
    withTemporaryCardDefinitions([combatTestCreatureDefinition], () => {
      const state = createInitialGameState("p1", "p2", {
        id: "projection-combat-attacker-available",
        rngSeed: "projection-combat-attacker-available-seed"
      });

      state.turnState.phase = "DECLARE_ATTACKERS";
      state.turnState.step = "DECLARE_ATTACKERS";
      state.turnState.activePlayerId = "p1";
      state.turnState.priorityState.playerWithPriority = "p1";
      state.players[0].priority = true;
      state.players[1].priority = false;

      addObject(
        state,
        createObject(
          "combat-attacker",
          "p1",
          { kind: "battlefield", scope: "shared" },
          {
            cardDefId: combatTestCreatureDefinition.id
          }
        )
      );

      const view = projectPlayerView(state, "p1");

      expect(view.legalActions.hasOtherBlockingActions).toBe(true);
    });
  });

  it("does not flag empty declare blockers windows as other blocking actions", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "projection-combat-no-blockers",
      rngSeed: "projection-combat-no-blockers-seed"
    });

    state.turnState.phase = "DECLARE_BLOCKERS";
    state.turnState.step = "DECLARE_BLOCKERS";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState.playerWithPriority = "p2";
    state.players[0].priority = false;
    state.players[1].priority = true;

    const view = projectPlayerView(state, "p2");

    expect(view.legalActions.hasOtherBlockingActions).toBe(false);
  });

  it("flags declare blockers windows when the defending player has a legal blocker", () => {
    withTemporaryCardDefinitions([combatTestCreatureDefinition], () => {
      const state = createInitialGameState("p1", "p2", {
        id: "projection-combat-blocker-available",
        rngSeed: "projection-combat-blocker-available-seed"
      });

      state.turnState.phase = "DECLARE_BLOCKERS";
      state.turnState.step = "DECLARE_BLOCKERS";
      state.turnState.activePlayerId = "p1";
      state.turnState.attackers = ["declared-attacker"];
      state.turnState.priorityState.playerWithPriority = "p2";
      state.players[0].priority = false;
      state.players[1].priority = true;

      addObject(
        state,
        createObject(
          "combat-blocker",
          "p2",
          { kind: "battlefield", scope: "shared" },
          {
            cardDefId: combatTestCreatureDefinition.id
          }
        )
      );

      const view = projectPlayerView(state, "p2");

      expect(view.legalActions.hasOtherBlockingActions).toBe(true);
    });
  });

  it("does not flag declare blockers windows when there are no attackers to block", () => {
    withTemporaryCardDefinitions([combatTestCreatureDefinition], () => {
      const state = createInitialGameState("p1", "p2", {
        id: "projection-combat-no-attackers",
        rngSeed: "projection-combat-no-attackers-seed"
      });

      state.turnState.phase = "DECLARE_BLOCKERS";
      state.turnState.step = "DECLARE_BLOCKERS";
      state.turnState.activePlayerId = "p1";
      state.turnState.attackers = [];
      state.turnState.priorityState.playerWithPriority = "p2";
      state.players[0].priority = false;
      state.players[1].priority = true;

      addObject(
        state,
        createObject(
          "idle-blocker",
          "p2",
          { kind: "battlefield", scope: "shared" },
          {
            cardDefId: combatTestCreatureDefinition.id
          }
        )
      );

      const view = projectPlayerView(state, "p2");

      expect(view.legalActions.hasOtherBlockingActions).toBe(false);
    });
  });

  it("keeps mana abilities blocking when total mana across multiple lands unlocks a spell", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "projection-total-mana-blocking",
      rngSeed: "projection-total-mana-blocking-seed"
    });

    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState.playerWithPriority = "p1";
    state.players[0].priority = true;
    state.players[1].priority = false;

    addObject(
      state,
      createObject(
        "island-a",
        "p1",
        { kind: "battlefield", scope: "shared" },
        {
          cardDefId: "island"
        }
      )
    );
    addObject(
      state,
      createObject(
        "island-b",
        "p1",
        { kind: "battlefield", scope: "shared" },
        {
          cardDefId: "island"
        }
      )
    );
    addObject(
      state,
      createObject(
        "predict-hand",
        "p1",
        { kind: "hand", scope: "player", playerId: "p1" },
        {
          cardDefId: "predict"
        }
      )
    );

    const view = projectPlayerView(state, "p1");

    expect(view.legalActions.battlefield["island-a"]?.[0]?.blocksAutoPass).toBe(true);
    expect(view.legalActions.battlefield["island-b"]?.[0]?.blocksAutoPass).toBe(true);
  });

  it("does not expose another player's legal actions in the projected view", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "projection-opponent-legal-actions",
      rngSeed: "projection-opponent-legal-actions-seed"
    });

    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p2";
    state.turnState.priorityState.playerWithPriority = "p2";
    state.players[0].priority = false;
    state.players[1].priority = true;

    addObject(
      state,
      createObject(
        "viewer-island",
        "p1",
        { kind: "hand", scope: "player", playerId: "p1" },
        {
          cardDefId: "island"
        }
      )
    );

    const view = projectPlayerView(state, "p1");

    expect(view.legalActions.passPriority).toBeNull();
    expect(view.legalActions.hand).toEqual({});
    expect(view.legalActions.battlefield).toEqual({});
    expect(view.legalActions.concede).toEqual({ command: { type: "CONCEDE" } });
  });
});
