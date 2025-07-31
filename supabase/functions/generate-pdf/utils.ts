// supabase/functions/generate-pdf/utils.ts

/**
 * Embaralha um array de forma determinística com base em uma semente (seed).
 * Perfeito para gerar diferentes versões da mesma prova.
 * @param array O array a ser embaralhado.
 * @param seed Um número usado como semente para o embaralhamento.
 * @returns O array embaralhado.
 */
export function shuffleArray<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let m = arr.length;

  // Um gerador de números pseudoaleatórios simples para consistência
  let random = seed;
  const next = () => {
    random = (random * 1664525 + 1013904223) % Math.pow(2, 32);
    return random / Math.pow(2, 32);
  };

  while (m) {
    const i = Math.floor(next() * m--);
    [arr[m], arr[i]] = [arr[i], arr[m]];
  }
  return arr;
}