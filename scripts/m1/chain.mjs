// Shared helpers for the M1 scripts: Paseo Next client, dry-run, and batch submit.
// The signer phrase comes only from env OAB_SIGNER_MNEMONIC. It is never printed.
import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy, ss58Encode } from '@polkadot-labs/hdkd-helpers';

export { Binary };
export const ASSET_HUB = process.env.OAB_WS ?? 'wss://paseo-asset-hub-next-rpc.polkadot.io';

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

export const hex = (u8) => '0x' + Buffer.from(u8).toString('hex');

export function connect() {
  const client = createClient(getWsProvider(ASSET_HUB));
  return { client, api: client.getUnsafeApi() };
}

export function signerFromEnv() {
  const phrase = process.env.OAB_SIGNER_MNEMONIC;
  if (!phrase) throw new Error('OAB_SIGNER_MNEMONIC is not set');
  const kp = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(phrase)))('');
  return {
    signer: getPolkadotSigner(kp.publicKey, 'Sr25519', kp.sign),
    address: ss58Encode(kp.publicKey),
  };
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

/** Submit Utility.batch_all(calls) and resolve when it is in a best block. */
export function submitBatch(api, signer, calls) {
  const tx = api.tx.Utility.batch_all({ calls: calls.map((c) => c.decodedCall) });
  return new Promise((resolve, reject) => {
    const sub = tx.signSubmitAndWatch(signer).subscribe({
      next: (ev) => {
        if (ev.type !== 'txBestBlocksState' || !ev.found) return;
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
