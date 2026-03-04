import { describe, expect, it } from "vitest";

import { Rng } from "../../src/rng/rng";

describe("rng/rng", () => {
  it("produces identical next() sequences for the same seed", () => {
    const first = new Rng("seed-a");
    const second = new Rng("seed-a");

    for (let index = 0; index < 1000; index += 1) {
      expect(first.next()).toBe(second.next());
    }
  });

  it("nextInt returns min when min and max are the same", () => {
    const rng = new Rng("seed-b");
    expect(rng.nextInt(4, 4)).toBe(4);
  });

  it("shuffle of an empty array returns a new empty array", () => {
    const rng = new Rng("seed-c");
    const source: number[] = [];
    const shuffled = rng.shuffle(source);

    expect(shuffled).toEqual([]);
    expect(shuffled).not.toBe(source);
  });

  it("shuffle of a single-element array returns a new identical array", () => {
    const rng = new Rng("seed-d");
    const source = [42];
    const shuffled = rng.shuffle(source);

    expect(shuffled).toEqual([42]);
    expect(shuffled).not.toBe(source);
  });

  it("next() always stays in [0,1) over repeated calls", () => {
    const rng = new Rng("seed-e");
    const values = Array.from({ length: 1000 }, () => rng.next());

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("getSeed allows continuation from the exact current state", () => {
    const first = new Rng("seed-f");

    first.next();
    first.next();
    first.nextInt(1, 3);

    const resumed = new Rng(first.getSeed());

    expect(resumed.next()).toBe(first.next());
    expect(resumed.next()).toBe(first.next());
    expect(resumed.next()).toBe(first.next());
  });
});
