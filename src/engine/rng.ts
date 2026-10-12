/* Générateur pseudo-aléatoire reproductible (mulberry32).
   Une partie démarrée avec la même graine se déroule à l'identique :
   pratique pour rejouer un bug ou, plus tard, synchroniser deux joueurs en ligne. */

export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return [value, t];
}

/** Mélange de Fisher-Yates ; renvoie le tableau mélangé et le nouvel état du générateur. */
export function shuffle<T>(items: T[], state: number): [T[], number] {
  const out = items.slice();
  let rng = state;
  for (let i = out.length - 1; i > 0; i--) {
    const [value, next] = nextRandom(rng);
    rng = next;
    const j = Math.floor(value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, rng];
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}
