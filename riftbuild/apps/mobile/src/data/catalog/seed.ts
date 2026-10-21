// Seed embedded by scripts/eas-seed.mjs during EAS builds; the committed file is an empty stub ({"seed": null}).
// Required lazily so the JSON is only evaluated on a first launch with an empty store.
export function bundledSeed(): unknown {
  return (require('../../../assets/seed/release.json') as { seed: unknown }).seed;
}
