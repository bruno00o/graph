const seedDefault = 0x2545f491

export function xorshift32(seed: number = seedDefault): () => number {
  let state = seed >>> 0 || seedDefault
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

export function jitterOf(random: () => number, scale: number): () => number {
  return () => (random() - 0.5) * scale
}
