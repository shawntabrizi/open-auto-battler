// Check a deployed @oab/engine against the oab-engine crate: version, vectors
// hash, and every golden-vector call (newGame, resolveTurn, replayBattle),
// compared byte for byte by dry-run. Also prints the dry-run weights of the
// measurement turns.
//
//   cargo run -p oab-plan -- engine /tmp/engine-plan.json
//   node scripts/check-engine.mjs /tmp/engine-plan.json <engine address> [origin ss58]
//
// No signer is needed: every call is a dry-run.
import { readFileSync } from 'fs';
import { connect, dryRun, j } from './chain.mjs';

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(2);
}, 1_200_000);

const [planPath, engine, originArg] = process.argv.slice(2);
if (!planPath || !engine) {
  console.error('usage: node check-engine.mjs <plan.json> <engine address> [origin ss58]');
  process.exit(1);
}
// Any mapped account works as the dry-run origin; default: the cdm paseo deployer.
const origin = originArg ?? '5CUbpNYAePqCdFkS6BWqVF4RDaAcsueW923DrJTnDUXHst7v';
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const word = (n) => BigInt(n).toString(16).padStart(64, '0');

const { client, api } = connect();
let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log('FAIL', msg);
};

try {
  const v = await dryRun(api, origin, engine, plan.versionCall);
  if (v.data !== '0x' + word(plan.engineVersion)) fail(`engineVersion ${v.data}`);
  const h = await dryRun(api, origin, engine, plan.hashCall);
  if (h.data !== plan.vectorsHash) fail(`vectorsHash ${h.data}`);
  console.log(`engineVersion ${parseInt(v.data, 16)} vectorsHash ${h.data}`);

  let n = 0;
  for (const c of plan.checks) {
    const r = await dryRun(api, origin, engine, c.call);
    const ok = r.ok && r.revert === c.revert && r.data === c.expect;
    if (!ok)
      fail(`${c.label}: ${j({ ok: r.ok, revert: r.revert, error: r.error, len: r.data?.length })}`);
    n += 1;
  }
  console.log(`corpus: ${n} calls checked, ${failures} failures`);

  for (const m of [plan.busiest, ...plan.measure]) {
    const r = await dryRun(api, origin, engine, m.call);
    const ok = r.ok && !r.revert && r.data === m.expect;
    if (!ok) fail(`measure ${m.label}`);
    console.log(
      `  ${m.label.padEnd(36)} events=${String(m.events).padStart(3)} ref_time=${r.weight.ref_time} proof_size=${r.weight.proof_size} ${ok ? 'match' : 'MISMATCH'}`
    );
  }
  console.log(failures === 0 ? 'ENGINE CONTRACT MATCHES THE CRATE' : `${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  client.destroy();
}
setTimeout(() => process.exit(process.exitCode ?? 0), 100);
