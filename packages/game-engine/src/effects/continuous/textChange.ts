import type {
  AbilityAst,
  BasicLandType,
  ConditionAst,
  KeywordAbilityAst,
  StaticAbilityAst,
  TriggerDefinitionAst
} from "../../cards/abilityAst";

export const BASIC_LAND_TYPE_VALUES: readonly BasicLandType[] = [
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest"
] as const;

const BASIC_LAND_TYPES = new Set<BasicLandType>(BASIC_LAND_TYPE_VALUES);

export type TextChangePayload = {
  fromLandType?: BasicLandType;
  toLandType?: BasicLandType;
  instanceId?: string;
};

export type LandTypeTextInstance = {
  id: string;
  landType: BasicLandType;
  label: string;
};

function instanceSemanticKey(ability: Readonly<AbilityAst>): string | null {
  switch (ability.kind) {
    case "keyword":
      return ability.keyword === "landwalk" ? "keyword:landwalk" : null;
    case "static":
      switch (ability.staticKind) {
        case "cant_attack_unless":
          return "static:cant_attack_unless";
        case "when_no_islands_sacrifice":
          return "static:when_no_islands_sacrifice";
      }
    case "trigger":
      return ability.condition === undefined ? null : `trigger:${ability.event}:condition`;
    case "activated":
      return null;
  }
}

function landTypeTextInstanceForAbility(
  ability: Readonly<AbilityAst>,
  occurrenceIndex: number
): LandTypeTextInstance | null {
  const semanticKey = instanceSemanticKey(ability);
  if (semanticKey === null) {
    return null;
  }

  switch (ability.kind) {
    case "keyword":
      if (ability.keyword !== "landwalk") {
        return null;
      }

      return {
        id: `${semanticKey}:${occurrenceIndex}`,
        landType: ability.landType,
        label: `${ability.landType} (landwalk #${occurrenceIndex + 1})`
      };
    case "static":
      switch (ability.staticKind) {
        case "cant_attack_unless":
          return {
            id: `${semanticKey}:${occurrenceIndex}`,
            landType: ability.condition.landType,
            label: `${ability.condition.landType} (attack restriction #${occurrenceIndex + 1})`
          };
        case "when_no_islands_sacrifice":
          return {
            id: `${semanticKey}:${occurrenceIndex}`,
            landType: ability.landType,
            label: `${ability.landType} (sacrifice restriction #${occurrenceIndex + 1})`
          };
      }
    case "trigger":
      if (ability.condition === undefined) {
        return null;
      }

      return {
        id: `${semanticKey}:${occurrenceIndex}`,
        landType: ability.condition.landType,
        label: `${ability.condition.landType} (trigger condition #${occurrenceIndex + 1})`
      };
    case "activated":
      return null;
  }
}

function rewriteLandType(
  landType: BasicLandType,
  payload: Readonly<TextChangePayload>
): BasicLandType {
  if (payload.toLandType === undefined) {
    return landType;
  }

  if (payload.fromLandType !== undefined && landType !== payload.fromLandType) {
    return landType;
  }

  return payload.toLandType;
}

function rewriteCondition(
  condition: Readonly<ConditionAst>,
  payload: Readonly<TextChangePayload>
): ConditionAst {
  return {
    ...condition,
    landType: rewriteLandType(condition.landType, payload)
  };
}

function rewriteKeywordAbility(
  ability: Readonly<KeywordAbilityAst>,
  payload: Readonly<TextChangePayload>
): KeywordAbilityAst {
  if (ability.keyword === "landwalk") {
    return {
      ...ability,
      landType: rewriteLandType(ability.landType, payload)
    };
  }

  return ability;
}

function rewriteStaticAbility(
  ability: Readonly<StaticAbilityAst>,
  payload: Readonly<TextChangePayload>
): StaticAbilityAst {
  switch (ability.staticKind) {
    case "cant_attack_unless":
      return {
        ...ability,
        condition: rewriteCondition(ability.condition, payload)
      };
    case "when_no_islands_sacrifice":
      return {
        ...ability,
        landType: rewriteLandType(ability.landType, payload)
      };
  }
}

function rewriteTriggerAbility(
  ability: Readonly<TriggerDefinitionAst>,
  payload: Readonly<TextChangePayload>
): TriggerDefinitionAst {
  return {
    ...ability,
    ...(ability.condition === undefined
      ? {}
      : {
          condition: rewriteCondition(ability.condition, payload)
        })
  };
}

export function applyTextChangeToAbility(
  ability: Readonly<AbilityAst>,
  payload: Readonly<TextChangePayload>
): AbilityAst {
  switch (ability.kind) {
    case "keyword":
      return rewriteKeywordAbility(ability, payload);
    case "static":
      return rewriteStaticAbility(ability, payload);
    case "trigger":
      return rewriteTriggerAbility(ability, payload);
    case "activated":
      return ability;
  }
}

export function isTextChangePayload(payload: unknown): payload is TextChangePayload {
  if (payload === null || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    (record.fromLandType === undefined ||
      BASIC_LAND_TYPES.has(record.fromLandType as BasicLandType)) &&
    (record.toLandType === undefined || BASIC_LAND_TYPES.has(record.toLandType as BasicLandType)) &&
    (record.instanceId === undefined || typeof record.instanceId === "string")
  );
}

export function applyTextChangeToAbilities(
  abilities: readonly Readonly<AbilityAst>[],
  payload: Readonly<TextChangePayload>
): AbilityAst[] {
  const semanticOccurrences = new Map<string, number>();

  return abilities.map((ability) => {
    const semanticKey = instanceSemanticKey(ability);
    const occurrenceIndex = semanticKey === null ? 0 : (semanticOccurrences.get(semanticKey) ?? 0);

    if (semanticKey !== null) {
      semanticOccurrences.set(semanticKey, occurrenceIndex + 1);
    }

    if (payload.instanceId !== undefined) {
      const instance = landTypeTextInstanceForAbility(ability, occurrenceIndex);
      if (instance?.id !== payload.instanceId) {
        return ability;
      }
    }

    return applyTextChangeToAbility(ability, payload);
  });
}

export function listLandTypesInAbilities(
  abilities: readonly Readonly<AbilityAst>[]
): BasicLandType[] {
  const landTypes = new Set<BasicLandType>();

  for (const ability of abilities) {
    switch (ability.kind) {
      case "keyword":
        if (ability.keyword === "landwalk") {
          landTypes.add(ability.landType);
        }
        break;
      case "static":
        switch (ability.staticKind) {
          case "cant_attack_unless":
            landTypes.add(ability.condition.landType);
            break;
          case "when_no_islands_sacrifice":
            landTypes.add(ability.landType);
            break;
        }
        break;
      case "trigger":
        if (ability.condition !== undefined) {
          landTypes.add(ability.condition.landType);
        }
        break;
      case "activated":
        break;
    }
  }

  return [...landTypes];
}

export function listLandTypeInstancesInAbilities(
  abilities: readonly Readonly<AbilityAst>[]
): LandTypeTextInstance[] {
  const semanticOccurrences = new Map<string, number>();

  return abilities
    .map((ability) => {
      const semanticKey = instanceSemanticKey(ability);
      const occurrenceIndex =
        semanticKey === null ? 0 : (semanticOccurrences.get(semanticKey) ?? 0);

      if (semanticKey !== null) {
        semanticOccurrences.set(semanticKey, occurrenceIndex + 1);
      }

      return landTypeTextInstanceForAbility(ability, occurrenceIndex);
    })
    .filter((instance): instance is LandTypeTextInstance => instance !== null);
}
