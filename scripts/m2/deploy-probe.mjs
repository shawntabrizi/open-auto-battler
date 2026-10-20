// Deploy the Identity probe (identity/probe), a test contract shaped like a
// mode's hot path. It is not a product contract and is not registered in CDM.
//
//   cd identity/probe && cargo build --release
//   OAB_SIGNER_MNEMONIC="<phrase>" node deploy-probe.mjs <identity address>
import { readFileSync } from 'fs';
import {
  Binary,
  addrWord,
  calldata,
  connect,
  dryRun,
  j,
  signerFromEnv,
  submit,
  wordAddr,
} from './chain.mjs';

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(2);
}, 300_000);

const [identity] = process.argv.slice(2);
if (!identity) {
  console.error('usage: node deploy-probe.mjs <identity address>');
  process.exit(1);
}
const blob = readFileSync(
  new URL('../../identity/probe/target/release/oab-identity-probe.polkavm', import.meta.url)
);
const { v0, address } = signerFromEnv();
const { client, api } = connect();
try {
  const data = '0x' + addrWord(identity);
  const dry = await api.apis.ReviveApi.instantiate(
    address,
    0n,
    undefined,
    undefined,
    { type: 'Upload', value: Binary.fromHex('0x' + blob.toString('hex')) },
    Binary.fromHex(data),
    undefined,
    { at: 'best' }
  );
  if (!dry.result.success) throw new Error(`dry-run: ${j(dry.result.value)}`);
  const w = dry.weight_required;
  const dep = dry.storage_deposit?.value ?? 0n;
  console.log(`dry-run ok: ref_time=${w.ref_time} proof_size=${w.proof_size} deposit=${dep}`);
  const tx = api.tx.Revive.instantiate_with_code({
    value: 0n,
    weight_limit: { ref_time: w.ref_time * 2n, proof_size: w.proof_size * 2n },
    storage_deposit_limit: dep * 2n + 1_000_000_000n,
    code: Binary.fromHex('0x' + blob.toString('hex')),
    data: Binary.fromHex(data),
    salt: undefined,
  });
  const r = await submit(tx, v0);
  const inst = r.events.find((e) => e.type === 'Revive' && e.value.type === 'Instantiated');
  console.log(
    j({
      ok: r.ok,
      block: r.block.number,
      txHash: r.txHash,
      error: r.error,
      probe: inst?.value.value.contract,
    })
  );
  // A sanity read: the probe points at Identity.
  if (inst) {
    const probe = inst.value.value.contract.asHex?.() ?? inst.value.value.contract;
    const back = await dryRun(api, address, probe, calldata('identityAddress()'));
    const ok = wordAddr(back.data) === identity.toLowerCase();
    console.log(`probe.identityAddress() = ${wordAddr(back.data)} ${ok ? 'ok' : 'MISMATCH'}`);
    process.exitCode = r.ok && ok ? 0 : 1;
  }
} finally {
  client.destroy();
}
setTimeout(() => process.exit(process.exitCode ?? 0), 100);
