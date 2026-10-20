// Shared helpers for the deploy and check scripts: Paseo Next client,
// dry-run, submit, ABI words, and the CDM registry.
// The signer phrase comes only from env OAB_SIGNER_MNEMONIC. It is never printed.
import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getTxCreator } from 'polkadot-api/tx-creator';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  ss58Encode,
} from '@polkadot-labs/hdkd-helpers';
import { keccak_256 } from '@noble/hashes/sha3.js';

export { Binary };
export const ASSET_HUB = process.env.OAB_WS ?? 'wss://paseo-asset-hub-next-rpc.polkadot.io';
/** CDM registry on Paseo Next. */
export const REGISTRY = '0xc1a73a4f93fde65b1cb1680baead248073566cb0';

export const hex = (u8) => '0x' + Buffer.from(u8).toString('hex');
export const j = (v) =>
  JSON.stringify(v, (_, x) =>
    typeof x === 'bigint'
      ? x.toString()
      : x instanceof Uint8Array
        ? hex(x)
        : x?.asHex
          ? x.asHex()
          : x
  );

export function connect() {
  const client = createClient(getWsProvider(ASSET_HUB));
  return { client, api: client.getUnsafeApi() };
}

/**
 * An sr25519 account. `v0` signs a classic (v4) extrinsic: extension pipeline
 * V0, native fee. (A PGAS fee needs a v5 general extrinsic on pipeline V1;
 * see `web/src/contract/v1.ts`.)
 */
function account(kp) {
  return {
    address: ss58Encode(kp.publicKey),
    v0: getTxCreator(kp.publicKey, 'Sr25519', kp.sign),
  };
}

export function signerFromEnv() {
  const phrase = process.env.OAB_SIGNER_MNEMONIC;
  if (!phrase) throw new Error('OAB_SIGNER_MNEMONIC is not set');
  return account(sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(phrase)))(''));
}

/** A dev account (//Alice ...). The dev phrase is public. */
export function devSigner(path) {
  return account(sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)))(path));
}

/** Dry-run a contract call. Returns { ok, revert, data (hex), weight, deposit }. */
export async function dryRun(api, origin, dest, calldataHex) {
  const r = await api.apis.ReviveApi.call(
    origin,
    dest,
    0n,
    undefined,
    undefined,
    Binary.fromHex(calldataHex),
    { at: 'best' }
  );
  const weight = r.weight_required ?? r.gas_required;
  const res = r.result;
  if (!res.success) return { ok: false, error: j(res.value), weight, deposit: r.storage_deposit };
  const flags = res.value.flags;
  const revert =
    typeof flags === 'bigint' || typeof flags === 'number'
      ? (BigInt(flags) & 1n) === 1n
      : flags?.asHex?.() === '0x00000001';
  const d = res.value.data;
  const data = typeof d === 'string' ? d : d instanceof Uint8Array ? hex(d) : d.asHex();
  return { ok: true, revert, data: data.toLowerCase(), weight, deposit: r.storage_deposit };
}

/** Create, submit, and resolve at the best block with all the tx's events. */
export function submit(tx, creator, options) {
  return new Promise((resolve, reject) => {
    const sub = tx.createSubmitAndWatch(creator, options).subscribe({
      next: (ev) => {
        if (ev.type !== 'inBestBlock') return;
        sub.unsubscribe();
        const interrupted = ev.events.some(
          (e) => e.type === 'Utility' && e.value.type === 'BatchInterrupted'
        );
        resolve({
          ok: ev.ok && !interrupted,
          block: ev.block,
          txHash: ev.txHash,
          error: ev.ok ? null : j(ev.dispatchError),
          events: ev.events,
        });
      },
      error: reject,
    });
  });
}

/** Build a Revive.call from a dry-run, with 50% weight headroom. */
export function reviveCall(api, dest, calldataHex, dry) {
  const w = dry.weight;
  const dep = dry.deposit?.value ?? 0n;
  return api.tx.Revive.call({
    dest,
    value: 0n,
    weight_limit: { ref_time: (w.ref_time * 3n) / 2n, proof_size: (w.proof_size * 3n) / 2n },
    storage_deposit_limit: dep * 2n + 10_000_000_000n,
    data: Binary.fromHex(calldataHex),
  });
}

/** Submit Utility.batch_all(calls) as `acc` (V0) and resolve at the best block. */
export function submitBatch(api, acc, calls) {
  return submit(api.tx.Utility.batch_all({ calls: calls.map((c) => c.decodedCall) }), acc.v0);
}

// ── ABI encoding (static types only) ──
export const selector = (sig) =>
  Buffer.from(keccak_256(new TextEncoder().encode(sig)))
    .subarray(0, 4)
    .toString('hex');
export const topic = (sig) => hex(keccak_256(new TextEncoder().encode(sig)));
export const word = (n) => BigInt(n).toString(16).padStart(64, '0');
export const addrWord = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
export const calldata = (sig, ...words) => '0x' + selector(sig) + words.join('');
/** The 20-byte address in ABI word `i` of `hexData`. */
export const wordAddr = (hexData, i = 0) => '0x' + hexData.slice(2 + i * 64 + 24, 2 + (i + 1) * 64);
export const wordInt = (hexData, i = 0) =>
  BigInt('0x' + hexData.slice(2 + i * 64, 2 + (i + 1) * 64));

/** H160 of a substrate account, as the runtime maps it. */
export async function h160Of(api, ss58) {
  const a = await api.apis.ReviveApi.address(ss58);
  return (typeof a === 'string' ? a : hex(a)).toLowerCase();
}

// ── CDM registry ──
const strTail = (s) => {
  const b = Buffer.from(s);
  return word(b.length) + b.toString('hex').padEnd(Math.ceil(b.length / 32) * 64, '0');
};

/** Registry getAddressAtVersion(name, version) -> address (throws if absent). */
export async function registryAddress(api, origin, name, version) {
  const data =
    '0x' + selector('getAddressAtVersion(string,uint32)') + word(64) + word(version) + strTail(name);
  const r = await dryRun(api, origin, REGISTRY, data);
  if (!r.ok || r.revert || wordInt(r.data, 0) !== 1n) {
    throw new Error(`${name}@${version} not in registry: ${j(r)}`);
  }
  return wordAddr(r.data, 1);
}
