import type { ObjectId, ObjectRef, PlayerId } from "../state/objectRef";
import type { TurnPhase, TurnStep } from "../state/gameState";
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

export type LossReason = string;
export type EventChoicePayload = unknown;

export type GameEventPayload =
  | { type: "CARD_DRAWN"; playerId: PlayerId; cardId: ObjectId }
  | {
      type: "ZONE_CHANGE";
      objectId: ObjectId;
      oldZcc: number;
      newZcc: number;
      from: ZoneRef;
      to: ZoneRef;
      toIndex?: number;
    }
  | { type: "SPELL_CAST"; object: ObjectRef; controller: PlayerId }
  | { type: "ABILITY_TRIGGERED"; source: ObjectRef; controller: PlayerId }
  | { type: "ABILITY_ACTIVATED"; source: ObjectRef; controller: PlayerId }
  | { type: "SPELL_RESOLVED"; object: ObjectRef }
  | { type: "SPELL_COUNTERED"; object: ObjectRef }
  | { type: "DAMAGE_DEALT"; source: ObjectRef; target: ObjectRef; amount: number }
  | { type: "LIFE_CHANGED"; playerId: PlayerId; amount: number; newTotal: number }
  | { type: "PRIORITY_PASSED"; playerId: PlayerId }
  | { type: "PHASE_CHANGED"; phase: TurnPhase; step: TurnStep }
  | { type: "PLAYER_LOST"; playerId: PlayerId; reason: LossReason }
  | { type: "SHUFFLED"; zone: ZoneRef; resultOrder: ObjectId[] }
  | { type: "CHOICE_MADE"; choiceId: string; playerId: PlayerId; selection: EventChoicePayload }
  | { type: "RNG_CONSUMED"; purpose: string; result: number }
  | { type: "CONTINUOUS_EFFECT_ADDED"; effectId: string; source: ObjectRef }
  | { type: "CONTINUOUS_EFFECT_REMOVED"; effectId: string }
  | { type: "CONTROL_CHANGED"; object: ObjectRef; from: PlayerId; to: PlayerId };

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
