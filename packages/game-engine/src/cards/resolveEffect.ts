export const RESOLVE_EFFECT_IDS = [
  "BRAINSTORM",
  "MYSTICAL_TUTOR",
  "PREDICT",
  "COUNTER",
  "MOVE_ZONE",
  "DRAW_ACCUMULATED_KNOWLEDGE"
] as const;

export type ResolveEffectId = (typeof RESOLVE_EFFECT_IDS)[number];

export type ResolveEffectSpec = {
  id: ResolveEffectId;
};

export function hasResolveEffect(
  effects: readonly ResolveEffectSpec[],
  effectId: ResolveEffectId
): boolean {
  return effects.some((effect) => effect.id === effectId);
}
