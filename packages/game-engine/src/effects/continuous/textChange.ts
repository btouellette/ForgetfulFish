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

// Small stable string key for a text-change payload to use in memoization
function payloadKey(payload: Readonly<TextChangePayload>): string {
  const instance = payload.instanceId ?? "";
  const from = payload.fromLandType ?? "";
  const to = payload.toLandType ?? "";
  return `${instance}|${from}->${to}`;
}

// Cache rewritten AbilityAst nodes per original ability object and payload key.
const abilityRewriteCache = new WeakMap<Readonly<AbilityAst>, Map<string, AbilityAst>>();

// Cache results for whole abilities arrays keyed by the source array reference and payload key.
const abilitiesArrayCache = new WeakMap<AbilityAst[], Map<string, AbilityAst[]>>();

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
  const landType = rewriteLandType(condition.landType, payload);
  if (landType === condition.landType) {
    return condition;
  }

  return {
    ...condition,
    landType
  };
}

function rewriteKeywordAbility(
  ability: Readonly<KeywordAbilityAst>,
  payload: Readonly<TextChangePayload>
): KeywordAbilityAst {
  if (ability.keyword === "landwalk") {
    const landType = rewriteLandType(ability.landType, payload);
    if (landType === ability.landType) {
      return ability;
    }

    return {
      ...ability,
      landType
    };
  }

  return ability;
}

function rewriteStaticAbility(
  ability: Readonly<StaticAbilityAst>,
  payload: Readonly<TextChangePayload>
): StaticAbilityAst {
  switch (ability.staticKind) {
    case "cant_attack_unless": {
      const condition = rewriteCondition(ability.condition, payload);
      if (condition === ability.condition) {
        return ability;
      }

      return {
        ...ability,
        condition
      };
    }
    case "when_no_islands_sacrifice": {
      const landType = rewriteLandType(ability.landType, payload);
      if (landType === ability.landType) {
        return ability;
      }

      return {
        ...ability,
        landType
      };
    }
  }
}

function rewriteTriggerAbility(
  ability: Readonly<TriggerDefinitionAst>,
  payload: Readonly<TextChangePayload>
): TriggerDefinitionAst {
  if (ability.condition === undefined) {
    return ability;
  }

  const condition = rewriteCondition(ability.condition, payload);
  if (condition === ability.condition) {
    return ability;
  }

  return {
    ...ability,
    condition
  };
}

export function applyTextChangeToAbility(
  ability: Readonly<AbilityAst>,
  payload: Readonly<TextChangePayload>
): AbilityAst {
  const key = payloadKey(payload);
  let cacheForAbility = abilityRewriteCache.get(ability);
  if (cacheForAbility !== undefined) {
    const cached = cacheForAbility.get(key);
    if (cached !== undefined) {
      return cached;
    }
  }

  let rewritten: AbilityAst;
  switch (ability.kind) {
    case "keyword":
      rewritten = rewriteKeywordAbility(ability, payload);
      break;
    case "static":
      rewritten = rewriteStaticAbility(ability, payload);
      break;
    case "trigger":
      rewritten = rewriteTriggerAbility(ability, payload);
      break;
    case "activated":
      rewritten = ability;
      break;
  }

  if (cacheForAbility === undefined) {
    cacheForAbility = new Map<string, AbilityAst>();
    abilityRewriteCache.set(ability, cacheForAbility);
  }
  cacheForAbility.set(key, rewritten);
  return rewritten;
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
  abilities: AbilityAst[],
  payload: Readonly<TextChangePayload>
): AbilityAst[] {
  const key = payloadKey(payload);
  const cacheForArray = abilitiesArrayCache.get(abilities);
  if (cacheForArray !== undefined) {
    const cached = cacheForArray.get(key);
    if (cached !== undefined) {
      return cached;
    }
  }

  const semanticOccurrences = new Map<string, number>();
  let result: AbilityAst[] | null = null;

  for (const [index, ability] of abilities.entries()) {
    const semanticKey = instanceSemanticKey(ability);
    const occurrenceIndex = semanticKey === null ? 0 : (semanticOccurrences.get(semanticKey) ?? 0);

    if (semanticKey !== null) {
      semanticOccurrences.set(semanticKey, occurrenceIndex + 1);
    }

    if (payload.instanceId !== undefined) {
      const instance = landTypeTextInstanceForAbility(ability, occurrenceIndex);
      if (instance?.id !== payload.instanceId) {
        if (result !== null) {
          result.push(ability);
        }
        continue;
      }
    }

    const rewrittenAbility = applyTextChangeToAbility(ability, payload);
    if (result === null) {
      if (rewrittenAbility === ability) {
        continue;
      }

      result = abilities.slice(0, index);
    }

    result.push(rewrittenAbility);
  }

  const rewrittenAbilities = result ?? abilities;

  let mapForArray = cacheForArray;
  if (mapForArray === undefined) {
    mapForArray = new Map<string, AbilityAst[]>();
    abilitiesArrayCache.set(abilities, mapForArray);
  }
  mapForArray.set(key, rewrittenAbilities);

  return rewrittenAbilities;
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
