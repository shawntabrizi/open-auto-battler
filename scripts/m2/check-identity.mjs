// Live M2 check of @oab/identity on Paseo Next, with fee evidence.
//
// Every transaction is a v5 general transaction on extension pipeline V1
// (`chain.mjs` `account().v1`): only V1 holds `ChargePGAS`, so only V1 pays
// its fee in PGAS. The player is //Alice; the session key is a fresh
// throwaway key.
//
//   1. Alice signs ONE batch: Assets.transfer_keep_alive(PGAS, session, budget)
//      + Identity.registerSession(session, now + ttl). The PGAS goes to the
//      session's own account (auto-mapped on creation), not to its H160.
//   2. The session key signs ONE all-Revive batch: Identity.acceptSession(alice)
//      + probe.whoami() (the probe resolves msg.sender through Identity).
//   3. The session key signs probe.whoami() again (a plain "turn" that writes
//      nothing, so the PGAS it burns is the fee alone).
//   4. Dry-run weights of resolve, registerSession, acceptSession, whoami.
//   5. Wait for expiry: resolve(session) and whoami() must revert.
//   6. Alice signs revokeSession(): the key is burned, her record is deleted
//      (its deposit refunded), and re-registering the key reverts.
//   7. The session key drains its PGAS back to Alice (precompile transfer).
// Free probes (validate_transaction, nothing submitted): a PGAS-only key on
// pipeline V0 and on V1.
//
// Fee events and native and PGAS balances before and after each extrinsic are
// printed and written to --out. Nothing swaps through the DOT<->PGAS pool. The
// session phrase (testnet throwaway) is written to --state for cleanup.
//
//   node check-identity.mjs <identity> <probe> --state <file> --out <file> [--ttl 240] [--budget 260000000]
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { entropyToMnemonic } from '@polkadot-labs/hdkd-helpers';
import {
  Binary,
  PGAS_ERC20,
  PGAS_ID,
  V1_OPTIONS,
  addrWord,
  calldata,
  connect,
  devSigner,
  dryRun,
  extrinsicForApi,
  feeEvents,
  h160Of,
  j,
  nativeOf,
  pgasOf,
  phraseSigner,
  selector,
  submit,
  topic,
  word,
  wordAddr,
  wordInt,
} from './chain.mjs';

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(2);
}, 1_200_000);

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const [identity, probe] = args;
const statePath = opt('--state');
const outPath = opt('--out');
if (!identity || !probe || !statePath || !outPath) {
  console.error(
    'usage: node check-identity.mjs <identity> <probe> --state <file> --out <file> [--ttl s] [--budget planck]'
  );
  process.exit(1);
}
const TTL = BigInt(opt('--ttl', '240'));
const BUDGET = BigInt(opt('--budget', '260000000'));

const { client, api } = connect();
const evidence = { identity, probe, steps: [], measure: {}, checks: [], validate: {} };
let failures = 0;
const check = (label, ok, detail) => {
  evidence.checks.push({ label, ok: !!ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' ' + detail : ''}`);
};
const err = (sig) => '0x' + selector(sig);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasTopic = (e, i, value) => j(e.value.value.topics[i]).includes(value.slice(2));

async function nowSecs() {
  return (await api.query.Timestamp.Now.getValue({ at: 'best' })) / 1000n;
}

async function balances(who) {
  const out = {};
  for (const [name, ss58] of Object.entries(who)) {
    out[name] = { native: await nativeOf(api, ss58), pgas: await pgasOf(api, ss58) };
  }
  return out;
}

/** A Revive.call with 2x the dry-run weight (as bloom and the client do). */
async function call(origin, dest, data) {
  const d = await dryRun(api, origin, dest, data);
  if (!d.ok || d.revert) throw new Error(`dry-run ${data.slice(0, 10)} -> ${dest}: ${j(d)}`);
  const w = d.weight;
  const dep = d.deposit?.value ?? 0n;
  return {
    dry: d,
    tx: api.tx.Revive.call({
      dest,
      value: 0n,
      weight_limit: { ref_time: w.ref_time * 2n, proof_size: w.proof_size * 2n },
      storage_deposit_limit: dep * 2n + 300_000_000n,
      data: Binary.fromHex(data),
    }),
  };
}

/** Fee estimate and validity of a tx at the best block (nothing submitted). */
async function inspect(tx, creator, options) {
  const { body, len } = extrinsicForApi(await tx.create(creator, options));
  const best = (await client.getBestBlocks())[0].hash;
  const valid = await api.apis.TaggedTransactionQueue.validate_transaction(
    { type: 'External' },
    body,
    best,
    { at: best }
  );
  const info = await api.apis.TransactionPaymentApi.query_info(body, len, { at: best });
  return {
    valid: valid.success,
    invalid: valid.success ? null : JSON.parse(j(valid.value)),
    len,
    estimatedFee: info.partial_fee,
  };
}

/** Submit on V1, with balances of `who` before and after and the fee events. */
async function step(label, tx, acc, who) {
  const pre = await inspect(tx, acc.v1, V1_OPTIONS);
  const before = await balances(who);
  const r = await submit(tx, acc.v1, V1_OPTIONS);
  const after = await balances(who);
  const fees = feeEvents(r.events);
  const s = {
    label,
    ok: r.ok,
    error: r.error,
    block: r.block.number,
    blockHash: r.block.hash,
    txHash: r.txHash,
    len: pre.len,
    estimatedFee: pre.estimatedFee,
    fees,
    before,
    after,
    allEvents: r.events.map((e) => `${e.type}.${e.value?.type}`),
  };
  evidence.steps.push(JSON.parse(j(s)));
  console.log(`\n== ${label}: ok=${r.ok} block=${r.block.number} tx=${r.txHash}`);
  console.log(`   estimated fee ${pre.estimatedFee}; fee events: ${j(fees)}`);
  for (const name of Object.keys(who)) {
    const b = before[name];
    const a = after[name];
    console.log(
      `   ${name}: native free ${b.native.free} -> ${a.native.free}; PGAS ${b.pgas} -> ${a.pgas} (delta ${a.pgas - b.pgas})`
    );
  }
  console.log(`   events: ${s.allEvents.join(', ')}`);
  if (!r.ok) throw new Error(`${label} failed: ${r.error}`);
  return r;
}

try {
  const spec = await api.constants.System.Version();
  evidence.runtime = `${spec.spec_name} ${spec.spec_version}`;
  console.log(`runtime ${evidence.runtime}`);

  const alice = devSigner('//Alice');
  const phrase = entropyToMnemonic(randomBytes(16));
  writeFileSync(statePath, JSON.stringify({ phrase, note: 'testnet throwaway session key' }));
  const session = phraseSigner(phrase);
  const aliceH = await h160Of(api, alice.address);
  const sessionH = await h160Of(api, session.address);
  evidence.accounts = { alice: alice.address, aliceH, session: session.address, sessionH };
  console.log(`alice ${alice.address} ${aliceH}`);
  console.log(`session ${session.address} ${sessionH}`);
  const who = { alice: alice.address, session: session.address };
  const resolveOf = (a) => calldata('resolve(address)', addrWord(a));

  // ── 1. setup, signed by the player (one prompt in the real client) ──
  const exp = (await nowSecs()) + TTL;
  const fund = api.tx.Assets.transfer_keep_alive({
    id: PGAS_ID,
    target: { type: 'Id', value: session.address },
    amount: BUDGET,
  });
  const reg = await call(
    alice.address,
    identity,
    calldata('registerSession(address,uint64)', addrWord(sessionH), word(exp))
  );
  evidence.measure.registerSession = { weight: reg.dry.weight, deposit: reg.dry.deposit };
  await step(
    'setup batch_all[Assets.transfer_keep_alive PGAS, Revive registerSession] (player, V1)',
    api.tx.Utility.batch_all({ calls: [fund.decodedCall, reg.tx.decodedCall] }),
    alice,
    who
  );
  const so = await dryRun(
    api,
    alice.address,
    identity,
    calldata('sessionOf(address)', addrWord(aliceH))
  );
  check(
    'sessionOf(alice) = (session, exp, offered)',
    wordAddr(so.data, 0) === sessionH && wordInt(so.data, 1) === exp && wordInt(so.data, 2) === 1n
  );
  const mapped = await api.query.Revive.OriginalAccount.getValue(sessionH, { at: 'best' });
  check('the session account was auto-mapped when it received PGAS', !!mapped);

  // ── free probes: a PGAS-only key on each pipeline ──
  const view = await call(session.address, identity, resolveOf(sessionH));
  const remark = api.tx.System.remark({ remark: Binary.fromHex('0x6f6162') });
  evidence.validate = {
    'V0 Revive.call': await inspect(view.tx, session.v0),
    'V1 Revive.call': await inspect(view.tx, session.v1, V1_OPTIONS),
    'V1 System.remark': await inspect(remark, session.v1, V1_OPTIONS),
    'V1 batch_all[Revive.call, System.remark]': await inspect(
      api.tx.Utility.batch_all({ calls: [view.tx.decodedCall, remark.decodedCall] }),
      session.v1,
      V1_OPTIONS
    ),
  };
  for (const [k, v] of Object.entries(evidence.validate))
    console.log(`validate (PGAS-only key) ${k}: ${j(v)}`);
  check('V0 cannot be paid with PGAS', !evidence.validate['V0 Revive.call'].valid);
  check('V1 is paid with PGAS', evidence.validate['V1 Revive.call'].valid);

  // ── 2. session key: accept + first contract call, one all-Revive batch, silent ──
  const acc = await call(
    session.address,
    identity,
    calldata('acceptSession(address)', addrWord(aliceH))
  );
  evidence.measure.acceptSession = { weight: acc.dry.weight, deposit: acc.dry.deposit };
  const who1 = await call(session.address, probe, calldata('whoami()'));
  const r2 = await step(
    'session batch_all[acceptSession, probe.whoami] (session key, V1)',
    api.tx.Utility.batch_all({ calls: [acc.tx.decodedCall, who1.tx.decodedCall] }),
    session,
    who
  );
  const emitted = r2.events.filter(
    (e) => e.type === 'Revive' && e.value.type === 'ContractEmitted'
  );
  const played = emitted.find((e) => hasTopic(e, 0, topic('Resolved(address,address)')));
  check(
    'SessionRegistered(alice, session) emitted',
    emitted.some(
      (e) =>
        hasTopic(e, 0, topic('SessionRegistered(address,address,uint64)')) &&
        hasTopic(e, 1, aliceH) &&
        hasTopic(e, 2, sessionH)
    )
  );
  check(
    'probe: caller = session key, player = alice (resolved inside a contract call)',
    played && hasTopic(played, 1, sessionH) && hasTopic(played, 2, aliceH)
  );

  // ── 3. a plain turn ──
  const who2 = await call(session.address, probe, calldata('whoami()'));
  await step('probe.whoami (session key, V1)', who2.tx, session, who);

  // ── 4. measurements (dry-run at the best block) ──
  const m = async (label, origin, dest, data) => {
    const d = await dryRun(api, origin, dest, data);
    evidence.measure[label] = { weight: d.weight, deposit: d.deposit, revert: d.revert };
    console.log(
      `measure ${label.padEnd(40)} ref_time=${d.weight.ref_time} proof_size=${d.weight.proof_size} deposit=${j(d.deposit)} revert=${d.revert}`
    );
    return d;
  };
  const rLive = await m('resolve(live session key)', alice.address, identity, resolveOf(sessionH));
  check('resolve(session) = alice', wordAddr(rLive.data) === aliceH);
  const rPlain = await m('resolve(plain account)', alice.address, identity, resolveOf(aliceH));
  check('resolve(alice) = alice', wordAddr(rPlain.data) === aliceH);
  await m('probe.whoami (session key)', session.address, probe, calldata('whoami()'));
  await m('probe.whoami (plain account)', alice.address, probe, calldata('whoami()'));
  const fresh = '0x' + randomBytes(20).toString('hex');
  await m(
    'registerSession (rotation: burns the bound key)',
    alice.address,
    identity,
    calldata('registerSession(address,uint64)', addrWord(fresh), word((await nowSecs()) + 60n))
  );
  const revDry = await m(
    'revokeSession (bound key)',
    alice.address,
    identity,
    calldata('revokeSession()')
  );
  check(
    'revokeSession refunds the owner record deposit',
    revDry.deposit?.type === 'Refund',
    j(revDry.deposit)
  );

  // ── 5. expiry ──
  while ((await nowSecs()) < exp + 2n) await sleep(4000);
  const rExp = await dryRun(api, alice.address, identity, resolveOf(sessionH));
  check(
    'after expiry resolve(session) reverts InvalidSession(session)',
    rExp.revert && rExp.data === err('InvalidSession(address)') + addrWord(sessionH),
    rExp.data
  );
  await m('resolve(expired key, reverts)', alice.address, identity, resolveOf(sessionH));
  const pExp = await dryRun(api, session.address, probe, calldata('whoami()'));
  check('after expiry probe.whoami from the session key reverts', pExp.revert, pExp.data);

  // ── 6. revoke (burn) ──
  const rev = await call(alice.address, identity, calldata('revokeSession()'));
  await step('revokeSession (player, V1)', rev.tx, alice, who);
  const so2 = await dryRun(
    api,
    alice.address,
    identity,
    calldata('sessionOf(address)', addrWord(aliceH))
  );
  check(
    'after revoke sessionOf(alice) = (0, 0, none)',
    so2.data === '0x' + '0'.repeat(192),
    so2.data
  );
  const ko = await dryRun(
    api,
    alice.address,
    identity,
    calldata('keyOf(address)', addrWord(sessionH))
  );
  check(
    'keyOf(session) = (alice, exp, revoked)',
    wordAddr(ko.data, 0) === aliceH && wordInt(ko.data, 1) === exp && wordInt(ko.data, 2) === 1n
  );
  const again = await dryRun(
    api,
    alice.address,
    identity,
    calldata('registerSession(address,uint64)', addrWord(sessionH), word((await nowSecs()) + 60n))
  );
  check(
    'a burned key cannot be registered again',
    again.revert && again.data === err('SessionKeyBurned()'),
    again.data
  );

  // ── 7. drain the session's PGAS back to the player (all-Revive, silent) ──
  const bal = await pgasOf(api, session.address);
  const sizing = await call(
    session.address,
    PGAS_ERC20,
    calldata('transfer(address,uint256)', addrWord(aliceH), word(bal / 2n))
  );
  const est = (await inspect(sizing.tx, session.v1, V1_OPTIONS)).estimatedFee;
  // Keep 2x the fee estimate for the fee itself. Below that a drain only
  // burns the rest as fee, so leave it.
  const drainAmount = bal - est * 2n;
  if (drainAmount > 0n) {
    const drain = await call(
      session.address,
      PGAS_ERC20,
      calldata('transfer(address,uint256)', addrWord(aliceH), word(drainAmount))
    );
    await step(`drain ${drainAmount} PGAS to the player (session key, V1)`, drain.tx, session, who);
  } else {
    console.log(`skip drain: ${bal} PGAS left is below 2x the fee (${est})`);
  }
  evidence.sessionLeft = await pgasOf(api, session.address);
  console.log(`session PGAS left: ${evidence.sessionLeft}`);

  console.log(failures === 0 ? '\nIDENTITY CHECK PASSED' : `\n${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR', e?.stack ?? e);
  evidence.error = String(e?.stack ?? e);
  process.exitCode = 1;
} finally {
  writeFileSync(outPath, j(evidence));
  client.destroy();
}
setTimeout(() => process.exit(process.exitCode ?? 0), 100);
