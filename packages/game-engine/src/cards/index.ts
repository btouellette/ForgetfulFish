import type { CardDefinition } from "./cardDefinition";
import { accumulatedKnowledgeCardDefinition } from "./accumulated-knowledge";
import { brainstormCardDefinition } from "./brainstorm";
import { islandCardDefinition } from "./island";
import { memoryLapseCardDefinition } from "./memory-lapse";

export const cardRegistry: Map<string, CardDefinition> = new Map([
  [accumulatedKnowledgeCardDefinition.id, accumulatedKnowledgeCardDefinition],
  [brainstormCardDefinition.id, brainstormCardDefinition],
  [islandCardDefinition.id, islandCardDefinition],
  [memoryLapseCardDefinition.id, memoryLapseCardDefinition]
]);

export { accumulatedKnowledgeCardDefinition };
export { brainstormCardDefinition };
export { islandCardDefinition };
export { memoryLapseCardDefinition };
export type { CardDefinition } from "./cardDefinition";
