import fc from "fast-check";

import type { Command, ChoicePayload, Mode, Target } from "../../src/commands/command";
import { createInitialGameState, type GameState, type ManaPool } from "../../src/state/gameState";
import type { GameObject } from "../../src/state/gameObject";
import type { ObjectId, PlayerId } from "../../src/state/objectRef";
import { zoneKey, type ZoneRef } from "../../src/state/zones";

const PLAYER_IDS = ["p1", "p2"] as const satisfies readonly PlayerId[];
const CARD_IDS = ["island", "memory-lapse", "accumulated-knowledge"] as const;

const SHARED_DECK_ZONE_REFS: readonly ZoneRef[] = [
  { kind: "library", scope: "shared" },
  { kind: "graveyard", scope: "shared" },
  { kind: "battlefield", scope: "shared" },
  { kind: "exile", scope: "shared" },
  { kind: "stack", scope: "shared" },
  { kind: "hand", scope: "player", playerId: "p1" },
  { kind: "hand", scope: "player", playerId: "p2" }
];

const playerIdArbitrary: fc.Arbitrary<PlayerId> = fc.constantFrom(...PLAYER_IDS);

function toObjectId(id: number): ObjectId {
  return `obj-${id}`;
}

const objectIdArbitrary: fc.Arbitrary<ObjectId> = fc
  .integer({ min: 0, max: 100_000 })
  .map((id) => toObjectId(id));

const manaPoolArbitrary: fc.Arbitrary<ManaPool> = fc.record({
  white: fc.integer({ min: 0, max: 12 }),
  blue: fc.integer({ min: 0, max: 12 }),
  black: fc.integer({ min: 0, max: 12 }),
  red: fc.integer({ min: 0, max: 12 }),
  green: fc.integer({ min: 0, max: 12 }),
  colorless: fc.integer({ min: 0, max: 12 })
});

const mapFromRecord = (record: Record<string, number>): Map<string, number> =>
  new Map(Object.entries(record));

export const zoneRefArbitrary: fc.Arbitrary<ZoneRef> = fc.constantFrom(...SHARED_DECK_ZONE_REFS);

const countersArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 8 }),
  fc.integer({ min: 0, max: 5 })
);

const objectCoreArbitraries = {
  zcc: fc.integer({ min: 0, max: 10 }),
  cardDefId: fc.constantFrom(...CARD_IDS),
  owner: playerIdArbitrary,
  controller: playerIdArbitrary,
  counters: countersArbitrary,
  damage: fc.integer({ min: 0, max: 10 }),
  tapped: fc.boolean(),
  summoningSick: fc.boolean(),
  zone: zoneRefArbitrary
};

const gameObjectBaseArbitrary = fc.record({
  id: objectIdArbitrary,
  ...objectCoreArbitraries,
  attachments: fc.uniqueArray(objectIdArbitrary, { maxLength: 3 })
});

export const gameObjectArbitrary: fc.Arbitrary<GameObject> = gameObjectBaseArbitrary.map(
  (object) => ({
    ...object,
    counters: mapFromRecord(object.counters),
    abilities: []
  })
);

type StateObjectModel = {
  id: number;
  zcc: number;
  cardDefId: (typeof CARD_IDS)[number];
  owner: PlayerId;
  controller: PlayerId;
  counters: Record<string, number>;
  damage: number;
  tapped: boolean;
  summoningSick: boolean;
  zone: ZoneRef;
};

const stateObjectModelArbitrary: fc.Arbitrary<StateObjectModel> = fc.record({
  id: fc.integer({ min: 0, max: 999_999 }),
  ...objectCoreArbitraries
});

type StateModel = {
  id: string;
  rngSeed: string;
  version: number;
  activePlayerId: PlayerId;
  priorityHolder: PlayerId;
  playerOne: { life: number; manaPool: ManaPool; priority: boolean };
  playerTwo: { life: number; manaPool: ManaPool; priority: boolean };
  objects: StateObjectModel[];
};

const stateModelArbitrary: fc.Arbitrary<StateModel> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 16 }),
  rngSeed: fc.string({ minLength: 1, maxLength: 24 }),
  version: fc.integer({ min: 1, max: 25 }),
  activePlayerId: playerIdArbitrary,
  priorityHolder: playerIdArbitrary,
  playerOne: fc.record({
    life: fc.integer({ min: 1, max: 40 }),
    manaPool: manaPoolArbitrary,
    priority: fc.boolean()
  }),
  playerTwo: fc.record({
    life: fc.integer({ min: 1, max: 40 }),
    manaPool: manaPoolArbitrary,
    priority: fc.boolean()
  }),
  objects: fc.uniqueArray(stateObjectModelArbitrary, {
    maxLength: 20,
    selector: (object) => object.id
  })
});

function getRequiredZone(state: GameState, zoneRef: ZoneRef): ObjectId[] {
  const key = zoneKey(zoneRef);
  const zone = state.zones.get(key);

  if (!zone) {
    throw new Error(`missing expected zone key '${key}' in shared-deck state`);
  }

  return zone;
}

function applyStateModel(state: GameState, model: StateModel): void {
  state.version = model.version;
  state.turnState.activePlayerId = model.activePlayerId;
  state.turnState.priorityState = {
    holder: model.priorityHolder,
    passedBy: []
  };

  state.players[0].life = model.playerOne.life;
  state.players[0].manaPool = model.playerOne.manaPool;
  state.players[0].priority = model.playerOne.priority;

  state.players[1].life = model.playerTwo.life;
  state.players[1].manaPool = model.playerTwo.manaPool;
  state.players[1].priority = model.playerTwo.priority;
}

function toGameObject(model: StateObjectModel): GameObject {
  return {
    id: toObjectId(model.id),
    zcc: model.zcc,
    cardDefId: model.cardDefId,
    owner: model.owner,
    controller: model.controller,
    counters: mapFromRecord(model.counters),
    damage: model.damage,
    tapped: model.tapped,
    summoningSick: model.summoningSick,
    attachments: [],
    abilities: [],
    zone: model.zone
  };
}

export const gameStateArbitrary: fc.Arbitrary<GameState> = stateModelArbitrary.map((model) => {
  const state = createInitialGameState("p1", "p2", {
    id: `g-${model.id}`,
    rngSeed: `seed-${model.rngSeed}`
  });

  applyStateModel(state, model);

  for (const objectModel of model.objects) {
    const object = toGameObject(objectModel);

    state.objectPool.set(object.id, object);

    const zone = getRequiredZone(state, objectModel.zone);
    zone.push(object.id);
  }

  for (const player of state.players) {
    const handZone = getRequiredZone(state, { kind: "hand", scope: "player", playerId: player.id });
    player.hand = [...handZone];
  }

  return state;
});

const objectRefArbitrary = fc.record({
  id: objectIdArbitrary,
  zcc: fc.integer({ min: 0, max: 10 })
});

const targetArbitrary: fc.Arbitrary<Target> = fc.oneof(
  objectRefArbitrary.map((object) => ({ kind: "object" as const, object })),
  playerIdArbitrary.map((playerId) => ({ kind: "player" as const, playerId }))
);

const modeArbitrary: fc.Arbitrary<Mode> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  label: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
});

const choicePayloadArbitrary: fc.Arbitrary<ChoicePayload> = fc.oneof(
  fc.record({
    type: fc.constant("CHOOSE_CARDS" as const),
    selected: fc.uniqueArray(objectIdArbitrary, { maxLength: 5 }),
    min: fc.integer({ min: 0, max: 2 }),
    max: fc.integer({ min: 2, max: 5 })
  }),
  fc.record({
    type: fc.constant("ORDER_CARDS" as const),
    ordered: fc.uniqueArray(objectIdArbitrary, { maxLength: 5 })
  }),
  fc.record({
    type: fc.constant("NAME_CARD" as const),
    cardName: fc.string({ minLength: 1, maxLength: 24 })
  }),
  fc.record({
    type: fc.constant("CHOOSE_REPLACEMENT" as const),
    replacementId: fc.string({ minLength: 1, maxLength: 16 })
  }),
  fc.record({
    type: fc.constant("CHOOSE_MODE" as const),
    mode: modeArbitrary
  }),
  fc.record({
    type: fc.constant("CHOOSE_TARGET" as const),
    target: targetArbitrary
  }),
  fc.record({
    type: fc.constant("CHOOSE_YES_NO" as const),
    accepted: fc.boolean()
  }),
  fc.record({
    type: fc.constant("ORDER_TRIGGERS" as const),
    triggerIds: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 16 }), { maxLength: 5 })
  })
);

const castSpellCommandArbitrary: fc.Arbitrary<Command> = fc
  .record({
    cardId: objectIdArbitrary,
    targets: fc.option(fc.array(targetArbitrary, { maxLength: 3 }), { nil: undefined }),
    modePick: fc.option(modeArbitrary, { nil: undefined })
  })
  .map(({ cardId, targets, modePick }) => ({
    type: "CAST_SPELL" as const,
    cardId,
    ...(targets ? { targets } : {}),
    ...(modePick ? { modePick } : {})
  }));

const activateAbilityCommandArbitrary: fc.Arbitrary<Command> = fc
  .record({
    sourceId: objectIdArbitrary,
    abilityIndex: fc.integer({ min: 0, max: 4 }),
    targets: fc.option(fc.array(targetArbitrary, { maxLength: 3 }), { nil: undefined })
  })
  .map(({ sourceId, abilityIndex, targets }) => ({
    type: "ACTIVATE_ABILITY" as const,
    sourceId,
    abilityIndex,
    ...(targets ? { targets } : {})
  }));

const makeChoiceCommandArbitrary: fc.Arbitrary<Command> = choicePayloadArbitrary.map((payload) => ({
  type: "MAKE_CHOICE" as const,
  payload
}));

const declareAttackersCommandArbitrary: fc.Arbitrary<Command> = fc
  .array(objectIdArbitrary, { maxLength: 6 })
  .map((attackers) => ({
    type: "DECLARE_ATTACKERS" as const,
    attackers
  }));

const declareBlockersCommandArbitrary: fc.Arbitrary<Command> = fc
  .array(
    fc.record({
      attackerId: objectIdArbitrary,
      blockerIds: fc.array(objectIdArbitrary, { maxLength: 3 })
    }),
    { maxLength: 6 }
  )
  .map((assignments) => ({
    type: "DECLARE_BLOCKERS" as const,
    assignments
  }));

const playLandCommandArbitrary: fc.Arbitrary<Command> = objectIdArbitrary.map((cardId) => ({
  type: "PLAY_LAND" as const,
  cardId
}));

export const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  castSpellCommandArbitrary,
  activateAbilityCommandArbitrary,
  fc.constant({ type: "PASS_PRIORITY" as const }),
  makeChoiceCommandArbitrary,
  declareAttackersCommandArbitrary,
  declareBlockersCommandArbitrary,
  playLandCommandArbitrary,
  fc.constant({ type: "CONCEDE" as const })
);

export const commandSequenceArbitrary: fc.Arbitrary<Command[]> = fc.array(commandArbitrary, {
  maxLength: 20
});
