import type { ResolveEffectKind, ResolveEffectSpec } from "../cards/resolveEffect";

export class OnResolveRegistry {
  private readonly effects: Set<ResolveEffectKind>;
  private readonly objectTargetRequirement: boolean;

  public constructor(effectSpecs: readonly ResolveEffectSpec[]) {
    this.effects = new Set(effectSpecs.map((effect) => effect.kind));
    this.objectTargetRequirement = effectSpecs.some(
      (effect) =>
        effect.kind === "counter_target_spell" ||
        effect.kind === "set_control_of_target" ||
        effect.kind === "untap_target" ||
        effect.kind === "add_continuous_effect_to_target"
    );
  }

  public has(effectKind: ResolveEffectKind): boolean {
    return this.effects.has(effectKind);
  }

  public requiresObjectTargets(): boolean {
    return this.objectTargetRequirement;
  }
}
