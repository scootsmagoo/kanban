import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nano = customAlphabet(alphabet, 16);

export function newId(prefix: string): string {
  return `${prefix}_${nano()}`;
}

// LexoRank-lite: produce a string sort key strictly between `before` and `after`.
// Either bound may be undefined (= start / end of list).
//
// We use a base-62 fractional system. The key insight: if we always pick a
// midpoint, we never need to renumber. Strings just keep getting longer over
// time, but in practice a couple of dozen drags is fine.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const FIRST = ALPHABET[0];
const LAST = ALPHABET[ALPHABET.length - 1];
const MID = ALPHABET[Math.floor(ALPHABET.length / 2)];

function charValue(c: string): number {
  return ALPHABET.indexOf(c);
}

function midChar(a: string, b: string): string {
  const ai = charValue(a);
  const bi = charValue(b);
  return ALPHABET[Math.floor((ai + bi) / 2)];
}

export function positionBetween(before?: string | null, after?: string | null): string {
  const a = before ?? "";
  const b = after ?? "";

  if (!a && !b) return MID;
  if (!a) {
    // Insert before `b`. Pick a key strictly less than b.
    let i = 0;
    let result = "";
    while (true) {
      const bc = b[i] ?? FIRST;
      if (bc === FIRST) {
        result += FIRST;
        i++;
        continue;
      }
      result += midChar(FIRST, bc);
      return result;
    }
  }
  if (!b) {
    // Insert after `a`. Pick a key strictly greater than a.
    let i = 0;
    let result = "";
    while (true) {
      const ac = a[i] ?? LAST;
      if (ac === LAST) {
        result += LAST;
        i++;
        continue;
      }
      result += midChar(ac, LAST);
      return result;
    }
  }

  // Both bounds set: walk char by char, find the midpoint.
  let i = 0;
  let prefix = "";
  while (true) {
    const ac = a[i] ?? FIRST;
    const bc = b[i] ?? LAST;
    if (ac === bc) {
      prefix += ac;
      i++;
      continue;
    }
    const mid = midChar(ac, bc);
    if (mid !== ac) return prefix + mid;
    // No room between ac and bc at this digit — extend a's tail.
    prefix += ac;
    i++;
    // After this we're effectively `positionBetween(a.slice(i), null)`
    // but bounded by bc — fall through to "pick something > a's tail".
    let j = i;
    let result = prefix;
    while (true) {
      const ac2 = a[j] ?? FIRST;
      if (ac2 === LAST) {
        result += LAST;
        j++;
        continue;
      }
      result += midChar(ac2, LAST);
      return result;
    }
  }
}
