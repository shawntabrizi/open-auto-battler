/**
 * Node-side chain access for the specs: read the arena contract as a given
 * origin, and top up a test product account from //Alice. Paseo Asset Hub Next
 * only (testnet; //Alice is the public dev key).
 */
import { readFileSync } from 'node:fs';
import { createClient, Enum, type PolkadotClient, type SS58String } from 'polkadot-api';
import { submitAndWatch } from '@parity/product-sdk-tx';
import { getWsProvider } from 'polkadot-api/ws';
import { getTxCreator } from 'polkadot-api/tx-creator';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { createContractFromClient, type AbiEntry } from '@parity/product-sdk-contracts';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { PASEO_ASSET_HUB } from '@parity/host-api-test-sdk';

const cdm = JSON.parse(readFileSync(new URL('../cdm.json', import.meta.url), 'utf8')) as {
  contracts: Record<string, { address: `0x${string}`; abi: AbiEntry[] }>;
};
const ARENA = cdm.contracts['@oab/arena'];

/** 1 PAS in planck (10 decimals). */
export const PAS = 10_000_000_000n;
/** PGAS asset id on Paseo Next (src/contract/session.ts). */
export const PGAS_ASSET_ID = 2_000_000_000;

export interface Chain {
  client: PolkadotClient;
  free(address: SS58String): Promise<bigint>;
  pgas(address: SS58String): Promise<bigint>;
  /** Raw `getGameState()` bytes for `origin`; null when the read fails (e.g. unmapped). */
  gameState(origin: SS58String): Promise<string | null>;
  /** Transfer from //Alice until `address` holds at least `min` (to `target`). */
  topUp(address: SS58String, min: bigint, target: bigint): Promise<void>;
  /** Transfer PGAS from //Alice until `address` holds at least `amount`. */
  topUpPgas(address: SS58String, amount: bigint): Promise<void>;
  destroy(): void;
}

function alice() {
  const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)));
  const kp = derive('//Alice');
  return getTxCreator(kp.publicKey, 'Sr25519', kp.sign);
}

/** True when `getGameState` returned no active game (empty or the zeroed sentinel). */
export function isNoGame(hex: string | null): boolean {
  if (hex === null) return true;
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  return body.length === 0 || /^0*$/.test(body);
}

/** Sign and submit as //Alice; resolves at best block (product-sdk-tx default). */
async function atBestBlock(
  label: string,
  tx: Parameters<typeof submitAndWatch>[0],
  signer: Parameters<typeof submitAndWatch>[1]
): Promise<void> {
  const r = await submitAndWatch(tx, signer);
  if (!r.ok) throw new Error(`${label} failed: ${r.error.message}`);
}

export function connectChain(): Chain {
  const client = createClient(getWsProvider(PASEO_ASSET_HUB.rpcUrl));
  const api = client.getTypedApi(paseo_asset_hub);
  const signer = alice();

  return {
    client,
    async free(address) {
      return (await api.query.System.Account.getValue(address, { at: 'best' })).data.free;
    },
    async pgas(address) {
      const a = await api.query.Assets.Account.getValue(PGAS_ASSET_ID, address, { at: 'best' });
      return a?.balance ?? 0n;
    },
    async gameState(origin) {
      const arena = createContractFromClient(client, paseo_asset_hub, ARENA.address, ARENA.abi, {
        defaultOrigin: origin,
      }) as unknown as {
        getGameState: { query(): Promise<{ success: boolean; value: unknown }> };
      };
      const r = await arena.getGameState.query();
      return r.success && typeof r.value === 'string' ? r.value : null;
    },
    async topUp(address, min, target) {
      const have = await this.free(address);
      if (have >= min) return;
      await atBestBlock(
        `top-up of ${address}`,
        api.tx.Balances.transfer_keep_alive({ dest: Enum('Id', address), value: target - have }),
        signer
      );
    },
    async topUpPgas(address, amount) {
      const have = await this.pgas(address);
      if (have >= amount) return;
      await atBestBlock(
        `PGAS top-up of ${address}`,
        api.tx.Assets.transfer({ id: PGAS_ASSET_ID, target: Enum('Id', address), amount: amount - have }),
        signer
      );
    },
    destroy() {
      client.destroy();
    },
  };
}
