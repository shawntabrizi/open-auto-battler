#!/usr/bin/env bun
/**
 * Register OAB cards and sets on the deployed @oab/arena contract via @dotdm/cdm.
 *
 * Reads a JSON dump (produced by `oab-register-cards --dump <path>`) of
 * SCALE-encoded card and set bytes, then submits one registerCard or
 * registerSet tx per item.
 *
 * Usage:
 *   bun run scripts/register-cards.ts <DUMP_JSON> [--ws ws://127.0.0.1:10020] [--suri //Alice]
 *
 * Run from web/ — needs cdm.json adjacent.
 */

import { readFileSync } from 'fs';
import { Binary, createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { createCdm } from '@dotdm/cdm';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';

import cdmJson from '../cdm.json' with { type: 'json' };
import '../.cdm/cdm.d.ts';

interface Dump {
  cards: string[]; // hex with 0x prefix
  sets: { id: number; name: string; data: string }[];
}

function parseArgs(argv: string[]) {
  let dumpPath: string | null = null;
  let wsUrl = 'ws://127.0.0.1:10020';
  let suri = '//Alice';
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ws') {
      wsUrl = argv[++i];
    } else if (a === '--suri') {
      suri = argv[++i];
    } else if (!dumpPath) {
      dumpPath = a;
    }
  }
  if (!dumpPath) {
    console.error('Usage: register-cards.ts <DUMP_JSON> [--ws <url>] [--suri <suri>]');
    process.exit(1);
  }
  return { dumpPath, wsUrl, suri };
}

function preparedSignerFromSuri(suri: string) {
  const name = suri.startsWith('//') ? suri.slice(2) : suri;
  const entropy = mnemonicToEntropy(DEV_PHRASE);
  const miniSecret = entropyToMiniSecret(entropy);
  const derive = sr25519CreateDerive(miniSecret);
  const kp = derive(`//${name}`);
  return getPolkadotSigner(kp.publicKey, 'Sr25519', kp.sign);
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function main() {
  const { dumpPath, wsUrl, suri } = parseArgs(process.argv);

  console.log(`Loading dump from ${dumpPath}...`);
  const dump = JSON.parse(readFileSync(dumpPath, 'utf-8')) as Dump;
  console.log(`  ${dump.cards.length} cards, ${dump.sets.length} sets`);

  const signer = preparedSignerFromSuri(suri);
  const client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
  const cdm = createCdm(cdmJson, { client, defaultSigner: signer });
  const arena = cdm.getContract('@oab/arena');

  // Explicit gas + storage limits sidestep sdk-ink's pre-flight dryRunCall,
  // which calls ReviveApi.trace_call — incompatible with the local PPN runtime.
  // Values match @dotdm/utils' GAS_LIMIT and STORAGE_DEPOSIT_LIMIT.
  // Note snake_case ref_time / proof_size — cdm's TxOpts type claims camelCase
  // but sdk-ink passes the value straight through to PAPI's typed Revive.call,
  // which decodes against runtime metadata where Weight uses snake_case fields.
  const txOpts = {
    gasLimit: { ref_time: 500_000_000_000n, proof_size: 2_000_000n },
    storageDepositLimit: 100_000_000_000_000n,
  } as unknown as Parameters<typeof arena.registerCard.tx>[1];

  // Parallel submission: Alice's nonce auto-increments per signAndSubmit, so
  // fire all txs at once and wait for all to finalize. Sequential takes ~45s
  // per tx (one block per finalization); parallel collapses 111 txs to ~1 min.
  console.log(`\nRegistering ${dump.cards.length} cards (parallel)...`);
  const cardStart = Date.now();
  const cardResults = await Promise.all(
    dump.cards.map(async (hex, i) => {
      try {
        const r = await arena.registerCard.tx(Binary.fromBytes(hexToBytes(hex)), txOpts);
        return { i, ok: r.ok, err: null as null | string };
      } catch (e) {
        return { i, ok: false, err: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  const cardOk = cardResults.filter((r) => r.ok).length;
  const cardFail = cardResults.length - cardOk;
  console.log(
    `  ${cardOk}/${dump.cards.length} cards registered in ${(Date.now() - cardStart) / 1000}s`
  );
  if (cardFail > 0) {
    console.error(`  ${cardFail} failed:`);
    for (const r of cardResults.filter((r) => !r.ok)) {
      console.error(`    card ${r.i}: ${r.err ?? 'tx returned ok=false'}`);
    }
  }

  console.log(`\nRegistering ${dump.sets.length} sets (parallel)...`);
  const setResults = await Promise.all(
    dump.sets.map(async (set) => {
      try {
        const r = await arena.registerSet.tx(
          set.id,
          Binary.fromBytes(hexToBytes(set.data)),
          txOpts
        );
        return { id: set.id, name: set.name, ok: r.ok, err: null as null | string };
      } catch (e) {
        return {
          id: set.id,
          name: set.name,
          ok: false,
          err: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );
  for (const r of setResults) {
    if (r.ok) console.log(`  Set ${r.id} '${r.name}' registered`);
    else console.error(`  Set ${r.id} '${r.name}' failed: ${r.err ?? 'tx returned ok=false'}`);
  }

  cdm.destroy();
  client.destroy();
  console.log('\nDone.');
}

await main();
