import type { ObjectId, ObjectRef, PlayerId } from "../state/objectRef";
import type { ZoneRef } from "../state/zones";

export type EventEnvelope = Readonly<{
  engineVersion: string;
  schemaVersion: number;
  gameId: string;
}>;

export type GameEventBase = {
  id: string;
  seq: number;
};

export type GameEventPayload =
  | { type: "CARD_DRAWN"; playerId: PlayerId; card: ObjectRef }
  | { type: "ZONE_CHANGE"; objectId: ObjectId; from: ZoneRef; to: ZoneRef }
  | { type: "SPELL_CAST"; playerId: PlayerId; spell: ObjectRef }
  | { type: "ABILITY_TRIGGERED"; source: ObjectRef; controller: PlayerId; abilityId: string }
  | { type: "ABILITY_ACTIVATED"; source: ObjectRef; controller: PlayerId; abilityId: string }
  | { type: "SPELL_RESOLVED"; spell: ObjectRef }
  | { type: "SPELL_COUNTERED"; spell: ObjectRef; by: ObjectRef | null }
  | {
      type: "DAMAGE_DEALT";
      amount: number;
      source: ObjectRef | null;
      targetPlayerId?: PlayerId;
      targetObject?: ObjectRef;
    }
  | { type: "LIFE_CHANGED"; playerId: PlayerId; delta: number }
  | { type: "PRIORITY_PASSED"; playerId: PlayerId }
  | { type: "PHASE_CHANGED"; from: string; to: string; activePlayerId: PlayerId }
  | { type: "PLAYER_LOST"; playerId: PlayerId; reason: string }
  | { type: "SHUFFLED"; zone: ZoneRef; playerId?: PlayerId }
  | { type: "CHOICE_MADE"; playerId: PlayerId; choiceId: string }
  | { type: "RNG_CONSUMED"; label: string; value: number }
  | { type: "CONTINUOUS_EFFECT_ADDED"; effectId: string }
  | { type: "CONTINUOUS_EFFECT_REMOVED"; effectId: string }
  | { type: "CONTROL_CHANGED"; objectId: ObjectId; from: PlayerId; to: PlayerId };

export type GameEvent = GameEventBase & EventEnvelope & GameEventPayload;

export function createEvent(
  envelope: EventEnvelope,
  seq: number,
  payload: GameEventPayload
): GameEvent {
  return {
    id: `${envelope.gameId}:${seq}`,
    seq,
    ...envelope,
    ...payload
  };
}
