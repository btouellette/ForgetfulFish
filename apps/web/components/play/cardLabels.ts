import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

export function resolveObjectLabel(
  objectPool: PlayerGameView["objectPool"],
  objectId: string
): string {
  const objectView = objectPool[objectId];
  return objectView?.name ?? objectView?.cardDefId ?? objectId;
}

export function buildDisambiguatedObjectLabels(
  objectIds: readonly string[],
  objectPool: PlayerGameView["objectPool"]
): Record<string, string> {
  const baseLabels = objectIds.map((objectId) => resolveObjectLabel(objectPool, objectId));
  const totals = new Map<string, number>();

  for (const baseLabel of baseLabels) {
    totals.set(baseLabel, (totals.get(baseLabel) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const labels: Record<string, string> = {};

  objectIds.forEach((objectId, index) => {
    const baseLabel = baseLabels[index] ?? objectId;
    const total = totals.get(baseLabel) ?? 0;
    if (total <= 1) {
      labels[objectId] = baseLabel;
      return;
    }

    const currentIndex = (seen.get(baseLabel) ?? 0) + 1;
    seen.set(baseLabel, currentIndex);
    labels[objectId] = `${baseLabel} #${currentIndex}`;
  });

  return labels;
}
