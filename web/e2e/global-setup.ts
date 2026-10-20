/**
 * Resolve the live Paseo Asset Hub Next genesis before any fixture is built.
 *
 * `@parity/host-api-test-sdk@0.17.0` ships `PASEO_ASSET_HUB` with a stale
 * genesis (0x23e7…) while its rpcUrl points at Asset Hub Next (0x4349… on
 * 2026-10-20). The host routes product chain traffic by genesis hash, so a
 * stale value means the app's chain client never connects. Read it from the
 * node instead of hardcoding it; workers inherit `process.env`.
 */
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { PASEO_ASSET_HUB } from '@parity/host-api-test-sdk';

async function readGenesis(): Promise<string> {
  const client = createClient(getWsProvider(PASEO_ASSET_HUB.rpcUrl));
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('genesis read timed out')), 30_000)
    );
    return (await Promise.race([client.getChainSpecData(), timeout])).genesisHash;
  } finally {
    client.destroy();
  }
}

export default async function globalSetup(): Promise<void> {
  if (process.env.OAB_E2E_GENESIS) return;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      process.env.OAB_E2E_GENESIS = await readGenesis();
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Could not read genesis from ${PASEO_ASSET_HUB.rpcUrl}: ${String(lastError)}`);
}
