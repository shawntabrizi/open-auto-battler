// Product manifest for `bulletin-deploy`. The CLI finds this file by walking up
// from the build dir (web/dist) and writes the root manifest (name, icon) and the
// app executable manifest to the dotNS text records of `oab-arena.paseo`.
// Format: bulletin-deploy docs/product-manifest.md. Kept as a plain object so the
// app needs no bulletin-deploy dependency; the CLI validates it at deploy time.
export default {
  domain: 'oab-arena.paseo',
  displayName: 'Open Auto Battler',
  description: 'Auto-battler card game played on a PolkaVM smart contract.',
  icon: { path: './product-icon.png', format: 'png' },
  executables: [{ kind: 'app', path: './dist', appVersion: [0, 1, 0] }],
};
