// Publish the 111 asset cards and sets 0-2 (with house ghosts) into @oab/content,
// then read everything back and compare it byte for byte with the plan.
//
//   cargo run -p oab-plan -- content /tmp/content-plan.json
//   OAB_SIGNER_MNEMONIC=... node publish-content.mjs /tmp/content-plan.json <content address> [--verify-only]
//
// The signer must be a curator (the deployer is the first one). The script is
// idempotent: cards already on chain are checked, not re-sent; a set whose id
// is already used is checked, not re-published.
import { readFileSync } from 'fs';
import { connect, dryRun, reviveCall, submitBatch, signerFromEnv, j } from './chain.mjs';

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(2);
}, 1_200_000);

const [planPath, content, flag] = process.argv.slice(2);
if (!planPath || !content) {
  console.error('usage: node publish-content.mjs <plan.json> <content address> [--verify-only]');
  process.exit(1);
}
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const verifyOnly = flag === '--verify-only';
const CHUNK = 20;
const EMPTY_BYTES = '0x' + '0'.repeat(62) + '20' + '0'.repeat(64);
const word = (n) => BigInt(n).toString(16).padStart(64, '0');

const { client, api } = connect();
const { signer, address: origin } = signerFromEnv();
let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log('FAIL', msg);
};

async function view(call) {
  const r = await dryRun(api, origin, content, call);
  if (!r.ok || r.revert) throw new Error(`view failed: ${j(r)}`);
  return r.data;
}

try {
  console.log('content', content, 'signer', origin);
  const count0 = parseInt((await view(plan.setCount)).slice(-4), 16);
  console.log('setCount before', count0);

  // ── cards ──
  const todo = [];
  for (const c of plan.cards) {
    const got = await view(c.get);
    if (got === c.getReturn) continue;
    if (got !== EMPTY_BYTES) {
      fail(`card ${c.id} on chain differs from the plan`);
      continue;
    }
    todo.push(c);
  }
  console.log(`cards: ${plan.cards.length - todo.length} present, ${todo.length} to publish`);
  if (!verifyOnly) {
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      const calls = [];
      for (const c of chunk) {
        const dry = await dryRun(api, origin, content, c.publish);
        if (!dry.ok || dry.revert) throw new Error(`publishCard ${c.id} dry-run: ${j(dry)}`);
        calls.push(reviveCall(api, content, c.publish, dry));
      }
      const r = await submitBatch(api, signer, calls);
      console.log(
        `  batch ${i / CHUNK + 1}: ${chunk.length} cards ok=${r.ok} block=${r.block.number} tx=${r.txHash}`
      );
      if (!r.ok) throw new Error(`batch failed: ${r.error}`);
    }
  }

  // ── sets ──
  for (const s of plan.sets) {
    const count = parseInt((await view(plan.setCount)).slice(-4), 16);
    if (count > s.id) {
      console.log(`set ${s.id} already published`);
      continue;
    }
    if (verifyOnly) {
      fail(`set ${s.id} missing`);
      continue;
    }
    if (count !== s.id) throw new Error(`next set id is ${count}, plan expects ${s.id}`);
    const dry = await dryRun(api, origin, content, s.publish);
    if (!dry.ok || dry.revert) throw new Error(`publishSet ${s.id} dry-run: ${j(dry)}`);
    const want = '0x' + word(s.id) + s.setHash.slice(2);
    if (dry.data !== want)
      throw new Error(`publishSet ${s.id} would return ${dry.data}, plan says ${want}`);
    console.log(
      `  publishSet ${s.id} dry-run weight ref_time=${dry.weight.ref_time} proof_size=${dry.weight.proof_size} deposit=${j(dry.deposit)}`
    );
    const r = await submitBatch(api, signer, [reviveCall(api, content, s.publish, dry)]);
    console.log(`  set ${s.id} "${s.name}" ok=${r.ok} block=${r.block.number} tx=${r.txHash}`);
    if (!r.ok) throw new Error(`publishSet failed: ${r.error}`);
  }

  // ── verify ──
  for (const c of plan.cards) {
    if ((await view(c.get)) !== c.getReturn) fail(`card ${c.id}`);
  }
  for (const s of plan.sets) {
    for (const r of s.reads) {
      const res = await dryRun(api, origin, content, r.call);
      const ok = res.ok && !res.revert && res.data === r.expect;
      if (!ok) fail(`set ${s.id} ${r.label}`);
      console.log(
        `  set ${s.id} ${r.label.padEnd(15)} ${ok ? 'match' : 'MISMATCH'}  ref_time=${res.weight.ref_time} proof_size=${res.weight.proof_size}`
      );
    }
  }
  const count = parseInt((await view(plan.setCount)).slice(-4), 16);
  console.log('setCount after', count);
  if (count !== plan.sets.length) fail(`setCount ${count}`);
  console.log(failures === 0 ? 'ALL CONTENT MATCHES THE PLAN' : `${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  client.destroy();
}
setTimeout(() => process.exit(process.exitCode ?? 0), 100);
