import type { GameAction, ReplacementId } from "../../actions/action";
import type { ConditionAst } from "../../cards/abilityAst";
import type { GameState } from "../../state/gameState";

export type ActionMatcher = (action: GameAction, state: Readonly<GameState>) => boolean;

export type ReplacementEffectDefinition = {
  id: ReplacementId;
  priority?: number;
  appliesTo: ActionMatcher;
  rewrite: (action: GameAction, state: Readonly<GameState>) => GameAction;
  condition?: ConditionAst;
};

type ActionType = GameAction["type"];

export class ReplacementRegistry {
  private readonly effectsByType: Map<ActionType, ReplacementEffectDefinition[]>;

  public constructor() {
    this.effectsByType = new Map();
  }

  public register(actionType: ActionType, effect: ReplacementEffectDefinition): void {
    const current = this.effectsByType.get(actionType) ?? [];
    this.effectsByType.set(actionType, [...current, effect]);
  }

  public getForType(actionType: ActionType): ReplacementEffectDefinition[] {
    return [...(this.effectsByType.get(actionType) ?? [])];
  }

  public matching(
    action: GameAction,
    state: Readonly<GameState>,
    excludedIds: ReadonlySet<ReplacementId>
  ): ReplacementEffectDefinition[] {
    return this.getForType(action.type)
      .filter((effect) => !excludedIds.has(effect.id) && effect.appliesTo(action, state))
      .sort((left, right) => {
        const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        if (left.id < right.id) {
          return -1;
        }
        if (left.id > right.id) {
          return 1;
        }
        return 0;
      });
  }
}
