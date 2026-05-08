#!/usr/bin/env bun
/**
 * Register OAB cards and sets on the deployed @oab/arena contract by bundling
 * all 100+ Revive.call extrinsics into a single Utility.batch_all transaction.
 *
 * Bypasses @dotdm/cdm's wrap (which calls signAndSubmit per item, hits nonce
 * reuse when fired in parallel, and 45s sequential × 114 items ≈ 85 min).
 * Hand-encodes Solidity ABI calldata, builds Revive.call via PAPI's unsafe
 * typed API, batches, signs once, finalizes once. Whole thing in ~one block.
 *
 * Usage:
 *   bun run scripts/register-cards.ts <DUMP_JSON> [--ws ws://127.0.0.1:10020] [--suri //Alice]
 *
 * Run from web/ — needs cdm.json adjacent (for the deployed contract address).
 */

import { readFileSync } from 'fs';
import { Binary, createClient, FixedSizeBinary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { batchSubmitAndWatch } from '@parity/product-sdk-tx';
import cdmJson from '../cdm.json' with { type: 'json' };

interface Dump {
  cards: string[]; // hex with 0x prefix (SCALE-encoded UnitCard)
  sets: { id: number; name: string; data: string }[]; // SCALE-encoded CardSet
}

// Selectors from contract/README.md (keccak256 of canonical signature, first 4 bytes).
const SEL_REGISTER_CARD = '0x704b59f5'; // registerCard(bytes)
const SEL_REGISTER_SET = '0x199f7cb7'; // registerSet(uint16,bytes)

// Per-call gas/storage budget. Generous: actual register call writes a single
// storage entry and returns early. snake_case to match runtime metadata.
const PER_CALL_GAS = { ref_time: 5_000_000_000n, proof_size: 200_000n };
const PER_CALL_STORAGE = 100_000_000_000_000n;

function parseArgs(argv: string[]) {
  let dumpPath: string | null = null;
  let wsUrl = 'ws://127.0.0.1:10020';
  let suri = '//Alice';
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ws') wsUrl = argv[++i];
    else if (a === '--suri') suri = argv[++i];
    else if (!dumpPath) dumpPath = a;
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

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** Pack a non-negative bigint into a 32-byte big-endian buffer (right-aligned). */
function uint256(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0 && v > 0n; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Pad a byte array up to a 32-byte multiple. */
function pad32(bytes: Uint8Array): Uint8Array {
  const target = Math.ceil(bytes.length / 32) * 32;
  const out = new Uint8Array(target);
  out.set(bytes);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Solidity ABI encoding: function(bytes) — selector + offset(0x20) + length + padded data. */
function encodeRegisterCard(scaleBytes: Uint8Array): Uint8Array {
  return concat(
    hexToBytes(SEL_REGISTER_CARD),
    uint256(0x20n), // offset to the bytes argument
    uint256(BigInt(scaleBytes.length)),
    pad32(scaleBytes)
  );
}

/** Solidity ABI: function(uint16, bytes) — sel + setId(32) + offset(0x40) + length + padded data. */
function encodeRegisterSet(setId: number, scaleBytes: Uint8Array): Uint8Array {
  return concat(
    hexToBytes(SEL_REGISTER_SET),
    uint256(BigInt(setId)),
    uint256(0x40n), // offset to the bytes argument (after setId slot)
    uint256(BigInt(scaleBytes.length)),
    pad32(scaleBytes)
  );
}

async function main() {
  const { dumpPath, wsUrl, suri } = parseArgs(process.argv);

  console.log(`Loading dump from ${dumpPath}...`);
  const dump = JSON.parse(readFileSync(dumpPath, 'utf-8')) as Dump;
  console.log(`  ${dump.cards.length} cards, ${dump.sets.length} sets`);

  // Contract address from cdm.json (the only target's @oab/arena entry).
  const target = Object.keys(cdmJson.contracts ?? {})[0];
  const contractAddress = (
    cdmJson.contracts as Record<string, Record<string, { address: string }>>
  )[target]['@oab/arena'].address;
  console.log(`  contract: ${contractAddress}`);

  const signer = preparedSignerFromSuri(suri);
  const client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: any = await client.getUnsafeApi();

  // Build one Revive.call extrinsic per card and per set.
  const dest = FixedSizeBinary.fromHex(contractAddress.toLowerCase());
  const reviveCallArgs = (data: Uint8Array) => ({
    dest,
    value: 0n,
    weight_limit: PER_CALL_GAS,
    storage_deposit_limit: PER_CALL_STORAGE,
    data: Binary.fromBytes(data),
  });

  console.log(`\nBuilding ${dump.cards.length + dump.sets.length} Revive.call extrinsics...`);
  const calls = [
    ...dump.cards.map((hex) =>
      api.tx.Revive.call(reviveCallArgs(encodeRegisterCard(hexToBytes(hex))))
    ),
    ...dump.sets.map((set) =>
      api.tx.Revive.call(reviveCallArgs(encodeRegisterSet(set.id, hexToBytes(set.data))))
    ),
  ];

  // Chunk to stay under per-extrinsic block weight. 114 calls × (5B refTime,
  // 200K proof_size) blow the proof_size cap (~5MB) when batched all at once.
  // 20 calls/chunk keeps each well under.
  const CHUNK_SIZE = 20;
  const chunks: (typeof calls)[] = [];
  for (let i = 0; i < calls.length; i += CHUNK_SIZE) chunks.push(calls.slice(i, i + CHUNK_SIZE));

  console.log(`Submitting ${chunks.length} batch_all chunk(s) of ≤${CHUNK_SIZE} calls each...`);
  const start = Date.now();
  let allOk = true;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const t0 = Date.now();
    const result = await batchSubmitAndWatch(c, api, signer, {
      mode: 'batch_all',
      waitFor: 'best-block',
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `  chunk ${i + 1}/${chunks.length}: ${c.length} calls  ok=${result.ok}  ${dt}s  tx=${result.txHash.slice(0, 12)}…`
    );
    if (!result.ok) {
      allOk = false;
      console.error(
        `    events:`,
        result.events.slice(0, 3).map((e) => JSON.stringify(e).slice(0, 120))
      );
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nTotal: ${calls.length} calls in ${elapsed}s, allOk=${allOk}`);

  void bytesToHex; // reserved for debug logging hooks
  client.destroy();
  process.exit(allOk ? 0 : 1);
}

await main();
