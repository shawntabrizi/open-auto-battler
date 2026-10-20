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
// Transitive (through @polkadot-labs/hdkd-helpers and @parity/product-sdk-keys):
// the raw sr25519 HDKD steps and RFC-0022 `index_bytes`.
import { getPublicKey, HDKD, secretFromSeed, sign } from '@scure/sr25519';
import { derivationIndexBytes } from '@parity/product-sdk-utils';
import {
  createContractFromClient,
  QUERY_FALLBACK_ORIGIN,
  type AbiEntry,
} from '@parity/product-sdk-contracts';
import { ss58Encode, ss58ToH160 } from '@parity/product-sdk-address';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { PASEO_ASSET_HUB } from '@parity/host-api-test-sdk';
import { decodeModeGame, type ModeGameInfo } from '../src/contract/codec';

const cdm = JSON.parse(readFileSync(new URL('../cdm.json', import.meta.url), 'utf8')) as {
  contracts: Record<string, { address: `0x${string}`; abi: AbiEntry[] }>;
};
const ARENA = cdm.contracts['@oab/arena'];
const IDENTITY = cdm.contracts['@oab/identity'];

/** 1 PAS in planck (10 decimals). */
export const PAS = 10_000_000_000n;
/** PGAS asset id on Paseo Next (src/contract/session.ts). */
export const PGAS_ASSET_ID = 2_000_000_000;

type Signer = ReturnType<typeof getTxCreator>;

/** A product account the test can also sign for from Node. */
export interface TestAccount {
  ss58: SS58String;
  signer: Signer;
}

/** SCALE string as a 32-byte chain code (label up to 31 bytes), like `//label`. */
function hardChainCode(label: string): Uint8Array {
  const bytes = new TextEncoder().encode(label);
  if (bytes.length > 31) throw new Error(`junction label too long: ${label}`);
  const code = new Uint8Array(32);
  code[0] = bytes.length << 2; // compact length, single-byte mode
  code.set(bytes, 1);
  return code;
}

/**
 * The OAB product account (index 0) the test host derives for the subtree
 * `//Alice//<label>`: hard junctions from the dev phrase, then the soft step
 * `index_bytes(0)` of RFC-0022 (`@parity/product-sdk-keys` product-account).
 * The spec checks the address against the one the app shows.
 */
export function productAccount(label: string): TestAccount {
  let secret = secretFromSeed(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)));
  for (const j of ['Alice', label]) secret = HDKD.secretHard(secret, hardChainCode(j));
  secret = HDKD.secretSoft(secret, derivationIndexBytes({ tag: 'Index', value: 0 }));
  const publicKey = getPublicKey(secret);
  return {
    ss58: ss58Encode(publicKey, 0),
    signer: getTxCreator(publicKey, 'Sr25519', (m) => sign(secret, m)),
  };
}

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
  /** `Identity.sessionOf(player)`: key H160, expiry (s), state (0 none, 1 offered, 2 bound). */
  sessionOf(address: SS58String): Promise<{ key: string; expiresAt: bigint; state: number }>;
  /** `Identity.keyOf(key H160)`: owner H160 (zero if never bound) and the burned flag. */
  keyOf(keyH160: string): Promise<{ owner: string; revoked: boolean }>;
  /** The SS58 account a mapped H160 belongs to (`Revive.OriginalAccount`). */
  accountOf(h160: string): Promise<SS58String>;
  /** The player revokes its session from outside the app (V0, native fee). */
  revokeSession(player: TestAccount): Promise<void>;
  /** `Balances.transfer_all` of `account` to //Alice (V0). Returns the planck sent. */
  returnToAlice(account: TestAccount): Promise<bigint>;
  destroy(): void;
}

const ALICE_KP = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)))('//Alice');
const ALICE = ss58Encode(ALICE_KP.publicKey, 0);

function alice() {
  return getTxCreator(ALICE_KP.publicKey, 'Sr25519', ALICE_KP.sign);
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

/** Reject when `p` takes longer than `ms`: a hung RPC read must fail, not wait for the test timeout. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`chain.${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const READS = new Set(['free', 'pgas', 'gameState', 'game', 'sessionOf', 'keyOf', 'accountOf']);
const CALL_TIMEOUT_MS = 60_000;

/**
 * A Node client of Asset Hub Next. Every call has a 60 s limit. A read that
 * fails or hangs (the RPC can drop the chainHead follow: `DisjointError`,
 * seen 2026-10-20) reconnects and tries again, up to 3 times. A transaction
 * is not resent.
 */
export function connectChain(): Chain {
  let inner = buildChain();
  return new Proxy({} as Chain, {
    get(_, prop: string) {
      if (prop === 'client') return inner.client;
      if (prop === 'destroy') return () => inner.destroy();
      return async (...args: unknown[]) => {
        for (let attempt = 1; ; attempt++) {
          const method = inner[prop as keyof Chain] as unknown as (
            ...a: unknown[]
          ) => Promise<unknown>;
          try {
            return await withTimeout(method.apply(inner, args), CALL_TIMEOUT_MS, prop);
          } catch (e) {
            if (!READS.has(prop) || attempt >= 3) throw e;
            console.log(`chain.${prop} failed (${String(e)}); reconnecting`);
            inner.destroy();
            inner = buildChain();
          }
        }
      };
    },
  });
}

function buildChain(): Chain {
  const client = createClient(getWsProvider(PASEO_ASSET_HUB.rpcUrl));
  const api = client.getTypedApi(paseo_asset_hub);
  const signer = alice();

  type Ok = { success: boolean; value: unknown };
  const identity = (as?: TestAccount) =>
    createContractFromClient(client, paseo_asset_hub, IDENTITY.address, IDENTITY.abi, {
      defaultOrigin: as?.ss58 ?? QUERY_FALLBACK_ORIGIN,
      defaultSigner: as?.signer,
    }) as unknown as {
      sessionOf: { query(owner: string): Promise<Ok> };
      keyOf: { query(key: string): Promise<Ok> };
      revokeSession: { tx(): Promise<{ ok: boolean; error: Error }> };
    };

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
    async sessionOf(address) {
      const r = await identity().sessionOf.query(ss58ToH160(address));
      if (!r.success) throw new Error(`sessionOf read failed for ${address}`);
      const [key, expiresAt, state] = Object.values(r.value as object) as [string, bigint, number];
      return { key, expiresAt: BigInt(expiresAt), state: Number(state) };
    },
    async keyOf(keyH160) {
      const r = await identity().keyOf.query(keyH160);
      if (!r.success) throw new Error(`keyOf read failed for ${keyH160}`);
      const [owner, , revoked] = Object.values(r.value as object) as [string, bigint, boolean];
      return { owner, revoked };
    },
    async accountOf(h160) {
      const id = await api.query.Revive.OriginalAccount.getValue(h160, { at: 'best' });
      if (!id) throw new Error(`${h160} is not mapped`);
      return id;
    },
    async revokeSession(player) {
      const r = await identity(player).revokeSession.tx();
      if (!r.ok) throw new Error(`revokeSession failed: ${r.error.message}`);
    },
    async returnToAlice(account) {
      const before = await this.free(account.ss58);
      await atBestBlock(
        `return of ${account.ss58}`,
        api.tx.Balances.transfer_all({ dest: Enum('Id', ALICE), keep_alive: false }),
        account.signer
      );
      return before;
    },
    destroy() {
      client.destroy();
    },
  };
}
