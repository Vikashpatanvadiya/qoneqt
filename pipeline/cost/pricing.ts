// Estimates from the Cloudflare Workers AI pricing page (checked 2 Oct 2026).
// Free tiers change: re-check before relying on these numbers.
export const cloudflare = {
  freeNeuronsPerDay: 10_000,
  usdPer1000Neurons: 0.011,
  flux: { neuronsPerTile512: 4.8, neuronsPerStep: 9.6 },
};

export function fluxNeurons(width: number, height: number, steps: number): number {
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return tiles * cloudflare.flux.neuronsPerTile512 + steps * cloudflare.flux.neuronsPerStep;
}
