/**
 * Resolve the live Paseo Asset Hub Next genesis before any fixture is built.
 *
 * `@parity/host-api-test-sdk@0.17.0` ships `PASEO_ASSET_HUB` with a stale
 * genesis (0x23e7…) while its rpcUrl points at Asset Hub Next (0x4349… on
 * 2026-10-20). The host routes product chain traffic by genesis hash, so a
 * stale value means the app's chain client never connects. Read it from the
 * node instead of hardcoding it; workers inherit `process.env`.
 */
import { PASEO_ASSET_HUB } from '@parity/host-api-test-sdk';

export default async function globalSetup(): Promise<void> {
  if (process.env.OAB_E2E_GENESIS) return;
  const httpUrl = PASEO_ASSET_HUB.rpcUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const res = await fetch(httpUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'chain_getBlockHash', params: [0] }),
  });
  const body = (await res.json()) as { result?: string };
  if (!body.result?.startsWith('0x')) {
    throw new Error(`Could not read genesis from ${httpUrl}: ${JSON.stringify(body)}`);
  }
  process.env.OAB_E2E_GENESIS = body.result;
}
