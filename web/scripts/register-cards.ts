#!/usr/bin/env bun
/**
 * Register all OAB cards and sets on the deployed @oab/arena contract.
 *
 * Uses the same product-sdk contract path as scripts/e2e-onchain.mjs: each
 * `registerCard` / `registerSet` call is prepared from the ABI in cdm.json and
 * submitted in `Utility.batch_all` chunks, signed once per chunk.
 *
 * Usage (run from web/, needs cdm.json adjacent for the address + ABI):
 *   OAB_MNEMONIC="<deployer phrase>" bun run scripts/register-cards.ts <DUMP_JSON> [--ws <url>]
 *
 * The signer must be the contract deployer (the admin). Generate the dump with
 *   cd register-cards && cargo run -- --dump <DUMP_JSON>
 */

import { readFileSync } from 'fs';
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getTxCreator } from 'polkadot-api/tx-creator';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy, ss58Encode } from '@polkadot-labs/hdkd-helpers';
import {
  createContractFromClient,
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
} from '@parity/product-sdk-contracts';
import { batchSubmitAndWatch, type BatchApi, type BatchableCall } from '@parity/product-sdk-tx';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import cdmJson from '../cdm.json' with { type: 'json' };

interface Dump {
  cards: string[]; // hex with 0x prefix (SCALE-encoded UnitCard)
  sets: { id: number; name: string; data: string }[]; // SCALE-encoded CardSet
}

// 20 calls per batch stays under the per-extrinsic proof_size cap.
const CHUNK_SIZE = 20;

function parseArgs(argv: string[]) {
  let dumpPath: string | null = null;
  let wsUrl = 'wss://paseo-asset-hub-next-rpc.polkadot.io';
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ws') wsUrl = argv[++i];
    else if (!dumpPath) dumpPath = a;
  }
  if (!dumpPath || !process.env.OAB_MNEMONIC) {
    console.error('Usage: OAB_MNEMONIC=<phrase> register-cards.ts <DUMP_JSON> [--ws <url>]');
    process.exit(1);
  }
  return { dumpPath, wsUrl, mnemonic: process.env.OAB_MNEMONIC };
}

async function main() {
  const { dumpPath, wsUrl, mnemonic } = parseArgs(process.argv);

  const dump = JSON.parse(readFileSync(dumpPath, 'utf-8')) as Dump;
  console.log(`Loaded ${dump.cards.length} cards, ${dump.sets.length} sets from ${dumpPath}`);

  const entry = (cdmJson.contracts as unknown as Record<string, { address: string; abi: unknown }>)[
    '@oab/arena'
  ];
  console.log(`contract: ${entry.address}`);

  const kp = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(mnemonic)))('');
  const signer = getTxCreator(kp.publicKey, 'Sr25519', kp.sign);
  const origin = ss58Encode(kp.publicKey);
  console.log(`signer: ${origin}`);

  const client = createClient(getWsProvider(wsUrl));
  try {
    // PAPI 3 types the unsafe API without pallets; it has Utility at runtime.
    const api = client.getUnsafeApi() as unknown as BatchApi;
    const mapped = await ensureContractAccountMapped(
      createContractRuntimeFromClient(client, paseo_asset_hub),
      origin,
      signer
    );
    if (!mapped.ok) throw new Error(`Account mapping failed: ${mapped.error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arena: any = createContractFromClient(
      client,
      paseo_asset_hub,
      entry.address,
      entry.abi as never,
      { defaultSigner: signer, defaultOrigin: origin }
    );

    // `.prepare()` returns a Result; stop on the first call that fails to build.
    const prepared = (r: { ok: boolean; value?: BatchableCall; error?: Error }) => {
      if (!r.ok) throw new Error(`prepare failed: ${r.error?.message}`);
      return r.value as BatchableCall;
    };
    const calls: BatchableCall[] = [];
    for (const hex of dump.cards) calls.push(prepared(await arena.registerCard.prepare(hex)));
    for (const set of dump.sets) {
      calls.push(prepared(await arena.registerSet.prepare(set.id, set.data)));
    }

    let allOk = true;
    for (let i = 0; i < calls.length; i += CHUNK_SIZE) {
      const chunk = calls.slice(i, i + CHUNK_SIZE);
      const r = await batchSubmitAndWatch(chunk, api, signer, {
        mode: 'batch_all',
        waitFor: 'best-block',
      });
      console.log(
        `  batch ${i / CHUNK_SIZE + 1}: ${chunk.length} calls ok=${r.ok}` +
          (r.ok ? '' : ` (${r.error.message})`)
      );
      if (!r.ok) allOk = false;
    }

    for (const set of dump.sets) {
      const read = await arena.getSet.query(set.id);
      const ok = read.success && read.value.length > 2;
      console.log(`  getSet(${set.id}) ${set.name}: ${ok ? 'registered' : 'MISSING'}`);
      if (!ok) allOk = false;
    }
    console.log(allOk ? 'All cards and sets registered.' : 'Registration had failures.');
    if (!allOk) process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
