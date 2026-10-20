// Shared helpers for the M2 scripts: Paseo Next client, dry-run, submit, ABI
// words. Based on scripts/m1/chain.mjs, moved to polkadot-api 3 because the
// PGAS fee path needs a v5 general transaction (see `account` below).
// The signer phrase comes only from env OAB_SIGNER_MNEMONIC. It is never printed.
import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getTxCreator, getVerifyMultiSignatureTxCreator } from 'polkadot-api/tx-creator';
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
export const PGAS_ID = 2_000_000_000;
/** PGAS ERC-20 precompile (asset id BE ++ 12 zero bytes ++ 0x0120 ++ 2 zero bytes). */
export const PGAS_ERC20 = '0x7735940000000000000000000000000001200000';

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
 * An sr25519 account with two transaction creators:
 *
 * - `v0`: a classic signed (v4) extrinsic. Runtime 3004000 runs it through
 *   extension pipeline V0, which has no `ChargePGAS`: the fee is native.
 * - `v1`: a general (v5) extrinsic on extension pipeline V1, signed through
 *   `VerifyMultiSignature`. V1 holds `ChargePGAS`, so the fee is paid in PGAS
 *   when the signer holds enough (individuality `f0d5e690c2`, 2026-10-08).
 *   Use `submit(tx, acc.v1, V1_OPTIONS)`.
 */
function account(kp) {
  return {
    address: ss58Encode(kp.publicKey),
    v0: getTxCreator(kp.publicKey, 'Sr25519', kp.sign),
    v1: getVerifyMultiSignatureTxCreator(kp.publicKey, 'Sr25519', kp.sign),
  };
}

/** Options for a V1 transaction: the Individuality extensions all unused. */
export const V1_OPTIONS = {
  extensionVersion: 1,
  customSignedExtensions: {
    AsScarcity: { value: undefined },
    AsPgas: { value: undefined },
    AsDotnsGateway: { value: undefined },
    RestrictOrigins: { value: false },
  },
};

export function signerFromEnv() {
  const phrase = process.env.OAB_SIGNER_MNEMONIC;
  if (!phrase) throw new Error('OAB_SIGNER_MNEMONIC is not set');
  return account(sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(phrase)))(''));
}

/** A dev account (//Alice ...). The dev phrase is public. */
export function devSigner(path) {
  return account(sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)))(path));
}

/** An account from a phrase (a throwaway session key). */
export function phraseSigner(phrase) {
  return account(sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(phrase)))(''));
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

/** The fee events of an extrinsic: which path paid, who, and how much. */
export function feeEvents(events) {
  const out = [];
  for (const e of events) {
    const t = `${e.type}.${e.value?.type}`;
    if (
      t === 'PgasAllowance.PGASFeePaid' ||
      t === 'TransactionPayment.TransactionFeePaid' ||
      t === 'AssetTxPayment.AssetTxFeePaid' ||
      t === 'AssetConversion.SwapExecuted' ||
      t === 'AssetConversion.SwapCreditExecuted'
    )
      out.push({ event: t, ...JSON.parse(j(e.value.value)) });
  }
  return out;
}

/**
 * An extrinsic (bytes from `tx.create`) as the unsafe API wants it for runtime
 * calls that take one: without the outer compact length prefix (the codec
 * adds its own). `len` is the full encoded length.
 */
export function extrinsicForApi(bytes) {
  const b = Buffer.from(bytes);
  const mode = b[0] & 3;
  const prefix = mode === 0 ? 1 : mode === 1 ? 2 : 4;
  return { body: Binary.fromHex('0x' + b.subarray(prefix).toString('hex')), len: b.length };
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

export async function nativeOf(api, ss58) {
  const a = await api.query.System.Account.getValue(ss58, { at: 'best' });
  return { free: a.data.free, reserved: a.data.reserved, frozen: a.data.frozen };
}

export async function pgasOf(api, ss58) {
  const a = await api.query.Assets.Account.getValue(PGAS_ID, ss58, { at: 'best' });
  return a?.balance ?? 0n;
}
