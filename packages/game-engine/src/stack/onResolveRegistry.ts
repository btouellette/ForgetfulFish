import type { ResolveEffectId, ResolveEffectSpec } from "../cards/resolveEffect";

export class OnResolveRegistry {
  private readonly effects: Set<ResolveEffectId>;

  public constructor(effectSpecs: readonly ResolveEffectSpec[]) {
    this.effects = new Set(effectSpecs.map((effect) => effect.id));
  }

  public has(effectId: ResolveEffectId): boolean {
    return this.effects.has(effectId);
  }
}
