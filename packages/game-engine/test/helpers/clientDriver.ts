import type { Command, PlayLandCommand } from "../../src/commands/command";
import { getLegalCommands } from "../../src/commands/validate";
import { processCommand, type CommandResult } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "./invariants";

type DriverPlayerId = "p1" | "p2";

function createIsland(
  id: string,
  owner: DriverPlayerId,
  zone: GameObject["zone"],
  tapped = false
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: "island",
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone
  };
}

export class ClientDriver {
  private currentState: GameState;

  private readonly eventLog: Array<{ type: string; seq: number }> = [];

  constructor(id: string, rngSeed: string) {
    this.currentState = createInitialGameState("p1", "p2", { id, rngSeed });
    assertStateInvariants(this.currentState);
  }

  get state(): Readonly<GameState> {
    return this.currentState;
  }

  get eventTypes(): readonly string[] {
    return this.eventLog.map((event) => event.type);
  }

  get events(): ReadonlyArray<{ type: string; seq: number }> {
    return this.eventLog;
  }

  run(command: Command): CommandResult {
    const result = processCommand(this.currentState, command, new Rng(this.currentState.rngSeed));
    this.currentState = result.nextState;
    this.eventLog.push(...result.newEvents.map((event) => ({ type: event.type, seq: event.seq })));
    assertStateInvariants(this.currentState);
    return result;
  }

  passBothPlayers(): string[] {
    const first = this.run({ type: "PASS_PRIORITY" });
    const second = this.run({ type: "PASS_PRIORITY" });
    return [...first.newEvents, ...second.newEvents].map((event) => event.type);
  }

  passUntilStepChanges(maxPasses = 12): string[] {
    const startActive = this.currentState.turnState.activePlayerId;
    const startStep = this.currentState.turnState.step;
    const collected: string[] = [];
    let previousVersion = this.currentState.version;

    for (let passCount = 0; passCount < maxPasses; passCount += 1) {
      const result = this.run({ type: "PASS_PRIORITY" });
      collected.push(...result.newEvents.map((event) => event.type));
      if (this.currentState.version <= previousVersion) {
        throw new Error("pass command did not advance engine version");
      }
      previousVersion = this.currentState.version;

      if (
        this.currentState.turnState.activePlayerId !== startActive ||
        this.currentState.turnState.step !== startStep
      ) {
        return collected;
      }
    }

    throw new Error("failed to advance to the next step within the pass budget");
  }

  advanceUntil(predicate: (state: Readonly<GameState>) => boolean, maxPairs = 48): void {
    for (let iteration = 0; iteration < maxPairs; iteration += 1) {
      if (predicate(this.currentState)) {
        return;
      }
      this.passUntilStepChanges();
    }

    throw new Error("failed to reach expected state within pass-priority iteration budget");
  }

  seedSharedLibrary(count: number): void {
    const libraryKey = zoneKey({ kind: "library", scope: "shared" });
    const library = this.currentState.zones.get(libraryKey);
    if (library === undefined) {
      throw new Error("missing shared library zone");
    }

    for (let index = 0; index < count; index += 1) {
      const cardId = `obj-library-island-${index}`;
      const card = createIsland(cardId, "p1", { kind: "library", scope: "shared" });
      this.currentState.objectPool.set(cardId, card);
      library.push(cardId);
    }
    assertStateInvariants(this.currentState);
  }

  seedPlayerHand(playerId: DriverPlayerId, cardId: string): void {
    const handZone = { kind: "hand", scope: "player", playerId } as const;
    const handKey = zoneKey(handZone);
    const hand = this.currentState.zones.get(handKey);
    if (hand === undefined) {
      throw new Error(`missing hand zone for ${playerId}`);
    }

    const card = createIsland(cardId, playerId, handZone);
    this.currentState.objectPool.set(cardId, card);
    hand.push(cardId);

    const playerIndex = this.currentState.players[0].id === playerId ? 0 : 1;
    this.currentState.players[playerIndex].hand.push(cardId);
    assertStateInvariants(this.currentState);
  }

  seedBattlefieldIsland(cardId: string, controller: DriverPlayerId, tapped: boolean): void {
    const battlefieldZone = { kind: "battlefield", scope: "shared" } as const;
    const battlefield = this.currentState.zones.get(zoneKey(battlefieldZone));
    if (battlefield === undefined) {
      throw new Error("missing shared battlefield zone");
    }

    this.currentState.objectPool.set(
      cardId,
      createIsland(cardId, controller, battlefieldZone, tapped)
    );
    battlefield.push(cardId);
    assertStateInvariants(this.currentState);
  }

  playFirstLegalLandFor(playerId: DriverPlayerId): string {
    const priorityHolder = this.currentState.turnState.priorityState.playerWithPriority;
    if (priorityHolder !== playerId) {
      throw new Error(
        `expected priority holder ${playerId} but found ${priorityHolder} at ${this.currentState.turnState.step}`
      );
    }

    const commands = getLegalCommands(this.currentState);
    const playLand = commands.find((command): command is PlayLandCommand => {
      return command.type === "PLAY_LAND";
    });

    if (playLand === undefined) {
      throw new Error(
        `expected PLAY_LAND command for ${playerId}; available=${commands
          .map((command) => command.type)
          .join(",")}`
      );
    }

    this.run(playLand);
    return playLand.cardId;
  }

  tapIslandForMana(cardId: string): void {
    const commands = getLegalCommands(this.currentState);
    const activateMana = commands.find((command) => {
      return command.type === "ACTIVATE_ABILITY" && command.sourceId === cardId;
    });

    if (activateMana === undefined) {
      throw new Error(`expected ACTIVATE_ABILITY command for ${cardId}`);
    }

    this.run(activateMana);
  }
}
