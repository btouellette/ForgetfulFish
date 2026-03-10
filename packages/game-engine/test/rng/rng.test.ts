import { describe, expect, it, vi } from "vitest";

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

  it("nextInt rejects unsafe integer bounds", () => {
    const rng = new Rng("seed-safe");

    expect(() => rng.nextInt(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError
    );
    expect(() => rng.nextInt(0, Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
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

  it("shuffle preserves undefined entries without throwing", () => {
    const rng = new Rng("seed-undefined");
    const source: Array<number | undefined> = [1, undefined, 2];
    const shuffled = rng.shuffle(source);

    expect(shuffled).not.toBe(source);
    expect(shuffled).toHaveLength(source.length);
    expect(shuffled.filter((value) => value === undefined)).toHaveLength(1);
    expect(shuffled.filter((value) => value === 1)).toHaveLength(1);
    expect(shuffled.filter((value) => value === 2)).toHaveLength(1);
  });

  it("shuffle advances RNG state like Fisher-Yates (n-1 draws)", () => {
    const shuffledRng = new Rng("seed-fisher-yates");
    shuffledRng.shuffle(["a", "b", "c", "d"]);

    const baselineRng = new Rng("seed-fisher-yates");
    for (let index = 3; index > 0; index -= 1) {
      baselineRng.nextInt(0, index);
    }

    expect(shuffledRng.getSeed()).toBe(baselineRng.getSeed());
  });

  it("shuffle does not rely on splice-based removal", () => {
    const rng = new Rng("seed-no-splice");
    const spliceSpy = vi.spyOn(Array.prototype, "splice");

    try {
      rng.shuffle(["a", "b", "c", "d"]);
      expect(spliceSpy).not.toHaveBeenCalled();
    } finally {
      spliceSpy.mockRestore();
    }
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
