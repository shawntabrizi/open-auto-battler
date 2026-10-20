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
import {
  createContractFromClient,
  QUERY_FALLBACK_ORIGIN,
  type AbiEntry,
} from '@parity/product-sdk-contracts';
import { ss58ToH160 } from '@parity/product-sdk-address';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { PASEO_ASSET_HUB } from '@parity/host-api-test-sdk';
import { decodeModeGame, type ModeGameInfo } from '../src/contract/codec';

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
  /** Raw `getGame(player)` bytes (SCALE `ModeGame`, `0x` for none); null when the read fails. */
  gameState(address: SS58String): Promise<string | null>;
  /** The decoded game of `address`, or null for none. Throws when the read fails. */
  game(address: SS58String): Promise<ModeGameInfo | null>;
  /** Transfer from //Alice until `address` holds at least `min` (to `target`). */
  topUp(address: SS58String, min: bigint, target: bigint): Promise<void>;
  /**
   * Transfer PGAS from //Alice until `address` (SS58) holds at least `amount`.
   * Always `Assets.transfer_keep_alive` to the SS58 account: PGAS sent to an
   * unmapped H160 through the ERC-20 precompile is lost.
   */
  topUpPgas(address: SS58String, amount: bigint): Promise<void>;
  destroy(): void;
}

function alice() {
  const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)));
  const kp = derive('//Alice');
  return getTxCreator(kp.publicKey, 'Sr25519', kp.sign);
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
    async gameState(address) {
      // The view takes the player, so any origin works; the pallet account is
      // always mapped.
      const arena = createContractFromClient(client, paseo_asset_hub, ARENA.address, ARENA.abi, {
        defaultOrigin: QUERY_FALLBACK_ORIGIN,
      }) as unknown as {
        getGame: { query(player: string): Promise<{ success: boolean; value: unknown }> };
      };
      const r = await arena.getGame.query(ss58ToH160(address));
      return r.success && typeof r.value === 'string' ? r.value : null;
    },
    async game(address) {
      const hex = await this.gameState(address);
      if (hex === null) throw new Error(`getGame read failed for ${address}`);
      return decodeModeGame(hex);
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
        api.tx.Assets.transfer_keep_alive({
          id: PGAS_ASSET_ID,
          target: Enum('Id', address),
          amount: amount - have,
        }),
        signer
      );
    },
    destroy() {
      client.destroy();
    },
  };
}
