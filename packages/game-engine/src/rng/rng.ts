const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;
const STATE_PREFIX = "u32:";

function coerceSeedToState(seed: string): number {
  if (seed.startsWith(STATE_PREFIX)) {
    const serialized = seed.slice(STATE_PREFIX.length);
    const parsed = Number(serialized);

    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffff_ffff) {
      return parsed >>> 0;
    }
  }

  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }

  return hash >>> 0;
}

function nextUnitInterval(state: number): number {
  let value = state >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const output = ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  return output;
}

export class Rng {
  private state: number;

  public constructor(seed: string) {
    this.state = coerceSeedToState(seed);
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    return nextUnitInterval(this.state);
  }

  public nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new RangeError("nextInt bounds must be safe integers");
    }

    if (max < min) {
      throw new RangeError("nextInt requires max >= min");
    }

    if (min === max) {
      return min;
    }

    const span = max - min + 1;
    return min + Math.floor(this.next() * span);
  }

  public shuffle<T>(arr: T[]): T[] {
    const pool = [...arr];
    const shuffled: T[] = [];

    while (pool.length > 0) {
      const pickIndex = this.nextInt(0, pool.length - 1);
      const picked = pool.splice(pickIndex, 1);

      if (picked.length !== 1) {
        throw new Error("Shuffle index out of bounds");
      }

      shuffled.push(...picked);
    }

    return shuffled;
  }

  public getSeed(): string {
    return `${STATE_PREFIX}${this.state}`;
  }
}
