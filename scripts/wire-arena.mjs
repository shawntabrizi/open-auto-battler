// Wire a freshly deployed @oab/arena and cache sets 0..2.
//
// Design section 11: dependency addresses come from the CDM registry at exact
// versions (getAddressAtVersion), never "latest", and go into the arena with
// the admin call setDeps. Then the admin caches each set (cacheSet copies the
// bundle and house ghosts from Content and checks the bundle hash) and allows
// it (setAllowedSet). Each step is skipped when the chain already has it, so
// the script can run again.
//
// Signer: the arena admin (the cdm deploy account), classic V0 transactions.
//
//   cd scripts && npm install
//   OAB_SIGNER_MNEMONIC="<deployer phrase>" node scripts/wire-arena.mjs <arena> [--out file]
import { writeFileSync } from 'fs';
import {
  Binary,
  addrWord,
  calldata,
  connect,
  dryRun,
  j,
  selector,
  signerFromEnv,
  submit,
  word,
  wordAddr,
  wordInt,
  registryAddress,
} from './chain.mjs';

/** The exact CDM versions this arena runs against. */
const DEPS = {
  identity: ['@oab/identity', 2],
  content: ['@oab/content', 0],
  engine: ['@oab/engine', 0],
};
const SETS = [0, 1, 2];

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(2);
}, 900_000);

const args = process.argv.slice(2);
const [arena] = args;
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!arena) {
  console.error('usage: node wire-arena.mjs <arena> [--out file]');
  process.exit(1);
}

const { client, api } = connect();
const admin = signerFromEnv();
const evidence = { arena, steps: [] };

async function send(label, data) {
  const d = await dryRun(api, admin.address, arena, data);
  if (!d.ok || d.revert) throw new Error(`${label} dry-run failed: ${j(d)}`);
  const w = d.weight;
  const dep = d.deposit?.value ?? 0n;
  const tx = api.tx.Revive.call({
    dest: arena,
    value: 0n,
    weight_limit: { ref_time: w.ref_time * 2n, proof_size: w.proof_size * 2n },
    storage_deposit_limit: dep * 2n + 1_000_000_000n,
    data: Binary.fromHex(data),
  });
  const r = await submit(tx, admin.v0);
  const step = { label, ok: r.ok, block: r.block.number, txHash: r.txHash, ref_time: w.ref_time, proof_size: w.proof_size, deposit: dep, error: r.error };
  evidence.steps.push(step);
  console.log(j(step));
  if (!r.ok) throw new Error(`${label} failed`);
}

try {
  const deps = {};
  for (const [k, [name, v]] of Object.entries(DEPS)) deps[k] = await registryAddress(api, admin.address, name, v);
  console.log('deps', j(deps));

  // The engine contract must run the engine the arena links.
  const ev = await dryRun(api, admin.address, deps.engine, calldata('engineVersion()'));
  const av = await dryRun(api, admin.address, arena, calldata('engineVersion()'));
  if (wordInt(ev.data) !== wordInt(av.data)) throw new Error(`engine ${wordInt(ev.data)} != arena ${wordInt(av.data)}`);
  console.log(`engineVersion: arena ${wordInt(av.data)} = @oab/engine ${wordInt(ev.data)}`);

  const cur = await dryRun(api, admin.address, arena, calldata('deps()'));
  const same = [deps.identity, deps.content, deps.engine].every((a, i) => wordAddr(cur.data, i) === a.toLowerCase());
  if (!same) await send('setDeps', calldata('setDeps(address,address,address)', addrWord(deps.identity), addrWord(deps.content), addrWord(deps.engine)));

  for (const s of SETS) {
    let info = await dryRun(api, admin.address, arena, calldata('setInfo(uint16)', word(s)));
    if (wordInt(info.data, 1) === 0n) await send(`cacheSet(${s})`, calldata('cacheSet(uint16)', word(s)));
    info = await dryRun(api, admin.address, arena, calldata('setInfo(uint16)', word(s)));
    if (wordInt(info.data, 4) !== 1n) await send(`setAllowedSet(${s})`, calldata('setAllowedSet(uint16,bool)', word(s), word(1)));
    info = await dryRun(api, admin.address, arena, calldata('setInfo(uint16)', word(s)));
    const hash = '0x' + info.data.slice(2, 66);
    const pinned = (await dryRun(api, admin.address, deps.content, calldata('setHash(uint16)', word(s)))).data;
    const row = { set: s, hash, len: wordInt(info.data, 1), pages: wordInt(info.data, 2), houseRounds: wordInt(info.data, 3), allowed: wordInt(info.data, 4) === 1n, equalsContent: hash === pinned };
    evidence.steps.push({ label: `setInfo(${s})`, ...row });
    console.log(j(row));
    if (!row.equalsContent || !row.allowed) throw new Error(`set ${s} not ready`);
  }
  evidence.deps = deps;
  process.exitCode = 0;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (outPath) writeFileSync(outPath, j(evidence));
  client.destroy();
}
setTimeout(() => process.exit(process.exitCode ?? 0), 100);
