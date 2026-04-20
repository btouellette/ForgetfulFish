import type { DerivedGameObjectView, GameObject, GameObjectBase } from "./gameObject";
import type { ObjectId, ObjectRef } from "./objectRef";
import type { ZoneRef } from "./zones";

export type LKISnapshot = {
  ref: ObjectRef;
  zone: ZoneRef;
  base: GameObjectBase;
  derived: DerivedGameObjectView;
};

function cloneGameObjectShape<T extends GameObjectBase | DerivedGameObjectView>(object: T): T {
  const typeView = object as Partial<DerivedGameObjectView>;

  return {
    ...object,
    counters: new Map(object.counters),
    attachments: [...object.attachments],
    abilities: [...object.abilities],
    ...(typeView.color === undefined ? {} : { color: [...typeView.color] }),
    ...(typeView.typeLine === undefined ? {} : { typeLine: [...typeView.typeLine] }),
    ...(typeView.subtypes === undefined ? {} : { subtypes: [...typeView.subtypes] })
  };
}

export function lkiKey(id: ObjectId, zcc: number): string {
  return `${id}:${zcc}`;
}

export function captureSnapshot(
  obj: GameObject,
  derivedView: DerivedGameObjectView,
  zone: ZoneRef
): LKISnapshot {
  const base = cloneGameObjectShape(obj);
  const derived = cloneGameObjectShape(derivedView);

  base.zone = zone;
  derived.zone = zone;

  return {
    ref: { id: obj.id, zcc: obj.zcc },
    zone,
    base,
    derived
  };
}

export function lookupLKI(
  store: Map<string, LKISnapshot>,
  id: ObjectId,
  zcc: number
): LKISnapshot | undefined {
  return store.get(lkiKey(id, zcc));
}
