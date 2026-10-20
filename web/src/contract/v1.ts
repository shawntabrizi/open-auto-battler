/**
 * Extension pipeline V1 on Paseo Asset Hub Next (runtime 3004000): a v5
 * general transaction whose fee `ChargePGAS` takes in PGAS. A classic v4
 * signed transaction runs pipeline V0 and pays native. See
 * `docs/CONTRACT_ARCHITECTURE.md` (M2 status) and `scripts/m2/chain.mjs`.
 *
 * No runtime imports: `scripts/check-v1-session.mjs` loads this file in Node.
 */

import type { SubmittableTransaction } from '@parity/product-sdk-tx';

/**
 * Options for a v5 general transaction on extension pipeline V1, the one with
 * `ChargePGAS` (runtime 3004000; `scripts/m2/chain.mjs`). The Individuality
 * extensions are present and unused.
 */
export const V1_OPTIONS = {
  extensionVersion: 1,
  customSignedExtensions: {
    AsScarcity: { value: undefined },
    AsPgas: { value: undefined },
    AsDotnsGateway: { value: undefined },
    RestrictOrigins: { value: false },
  },
};

/** Sign `tx` on pipeline V1 (fee in PGAS). `submitAndWatch` has no option for it. */
export const onPipelineV1 = (tx: SubmittableTransaction): SubmittableTransaction => ({
  createSubmitAndWatch: (signer, o) => tx.createSubmitAndWatch(signer, { ...o, ...V1_OPTIONS }),
});
