// Capture SCALE fixtures for the web client tests from @oab/arena (casual)
// on Paseo Next: the cached set-0 bundle, a new game, one battle report, and
// the game after that turn. //Alice plays on V0 (native fee) and abandons the
// game at the end. No PGAS is used.
//
//   node scripts/capture-fixtures.mjs <arena> web/src/contract/fixtures/arena.txt
import { writeFileSync } from 'fs';
import {
  Binary,
  addrWord,
  calldata,
  connect,
  devSigner,
  dryRun,
  h160Of,
  hex,
  submit,
  topic,
  word,
  wordInt,
} from './chain.mjs';

const [arena, outPath] = process.argv.slice(2);
if (!arena || !outPath) {
  console.error('usage: node capture-fixtures.mjs <arena> <out.txt>');
  process.exit(1);
}
const { client, api } = connect();
const alice = devSigner('//Alice');
const me = await h160Of(api, alice.address);

/** The `bytes` return value of a dry-run (ABI: offset, length, data). */
const bytesOut = (data) => {
  const len = Number(wordInt(data, 1));
  return '0x' + data.slice(2 + 128, 2 + 128 + len * 2);
};
const view = async (data) => {
  const r = await dryRun(api, alice.address, arena, data);
  if (!r.ok || r.revert) throw new Error(`view failed: ${JSON.stringify(r)}`);
  return bytesOut(r.data);
};
const getGame = () => view(calldata('getGame(address)', addrWord(me)));

async function call(label, data) {
  const d = await dryRun(api, alice.address, arena, data);
  if (!d.ok || d.revert) throw new Error(`${label} dry-run failed: ${JSON.stringify(d)}`);
  const w = d.weight;
  const tx = api.tx.Revive.call({
    dest: arena,
    value: 0n,
    weight_limit: { ref_time: w.ref_time * 2n, proof_size: w.proof_size * 2n },
    storage_deposit_limit: (d.deposit?.value ?? 0n) * 2n + 2_000_000_000n,
    data: Binary.fromHex(data),
  });
  const r = await submit(tx, alice.v0);
  if (!r.ok) throw new Error(`${label} failed: ${r.error}`);
  console.log('tx', label, 'block', r.block.number, r.txHash);
  return r;
}

const out = {};
out.set0_bundle = await view(calldata('getSetBundle(uint16)', word(0)));
if ((await getGame()) !== '0x') await call('abandonGame (leftover)', calldata('abandonGame()'));
await call('startGame(0)', calldata('startGame(uint16)', word(0)));
out.game_start = await getGame();
// An empty action: no shop change, the round-1 board fights.
const turn = await call('submitTurn(empty)', calldata('submitTurn(bytes)', word(32), word(1), '00'.padEnd(64, '0')));
const reported = topic('BattleReported(address,uint64,bytes)');
for (const e of turn.events) {
  if (e.type !== 'Revive' || e.value.type !== 'ContractEmitted') continue;
  const v = e.value.value;
  const asHex = (x) => (typeof x === 'string' ? x : x instanceof Uint8Array ? hex(x) : x.asHex());
  const topics = v.topics.map((t) => asHex(t).toLowerCase());
  if (topics[0] !== reported) continue;
  const data = asHex(v.data);
  out.battle_reported_topics = topics.join(',');
  out.battle_reported_data = data;
  out.report = bytesOut(data);
}
if (!out.report) throw new Error('no BattleReported event');
out.game_after_turn = await getGame();
await call('abandonGame', calldata('abandonGame()'));
out.game_none = await getGame();

writeFileSync(outPath, Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log('wrote', outPath, Object.keys(out).join(' '));
client.destroy();
process.exit(0);
