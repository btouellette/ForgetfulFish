import type { GameObject, GameObjectBase, GameObjectView } from "./gameObject";
import type { ObjectId, ObjectRef } from "./objectRef";
import type { ZoneRef } from "./zones";

export type LKISnapshot = {
  ref: ObjectRef;
  zone: ZoneRef;
  base: GameObjectBase;
  derived: GameObjectView;
};

function cloneGameObjectShape<T extends GameObjectBase | GameObjectView>(object: T): T {
  return {
    ...object,
    counters: new Map(object.counters),
    attachments: [...object.attachments],
    abilities: [...object.abilities]
  };
}

export function lkiKey(id: ObjectId, zcc: number): string {
  return `${id}:${zcc}`;
}

export function captureSnapshot(
  obj: GameObject,
  derivedView: GameObjectView,
  zone: ZoneRef
): LKISnapshot {
  return {
    ref: { id: obj.id, zcc: obj.zcc },
    zone,
    base: cloneGameObjectShape(obj),
    derived: cloneGameObjectShape(derivedView)
  };
}

export function lookupLKI(
  store: Map<string, LKISnapshot>,
  id: ObjectId,
  zcc: number
): LKISnapshot | undefined {
  return store.get(lkiKey(id, zcc));
}
