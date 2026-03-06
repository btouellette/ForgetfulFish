import type { CardDefinition } from "./cardDefinition";
import { accumulatedKnowledgeCardDefinition } from "./accumulated-knowledge";
import { islandCardDefinition } from "./island";
import { memoryLapseCardDefinition } from "./memory-lapse";

export const cardRegistry: Map<string, CardDefinition> = new Map([
  [accumulatedKnowledgeCardDefinition.id, accumulatedKnowledgeCardDefinition],
  [islandCardDefinition.id, islandCardDefinition],
  [memoryLapseCardDefinition.id, memoryLapseCardDefinition]
]);

export { accumulatedKnowledgeCardDefinition };
export { islandCardDefinition };
export { memoryLapseCardDefinition };
export type { CardDefinition } from "./cardDefinition";
