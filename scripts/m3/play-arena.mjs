// Live M3 check of @oab/arena (casual) on Paseo Next.
//
// Part A — //Alice plays one full casual game on set 0 with classic V0
//   transactions (native fee): startGame, turns until game over, endGame.
//   Each turn uses the corpus policy (play each hand card into the first
//   empty slot, else burn it), with the chain as the rule check: an action
//   list is kept only if a dry-run of submitTurn does not revert.
// Part B — a fresh session key plays for Alice through @oab/identity:
//   Alice funds the key (PGAS + native) and offers it; the key accepts, starts
//   Alice's next game, plays ONE turn as a v5 general transaction on pipeline
//   V1 (fee in PGAS), then the rest on V0, and ends the game. Alice revokes the
//   key; its next call must revert InvalidSession. The key's funds go back.
// Part C — every BattleReported of part A is replayed through
//   @oab/engine.replayBattle (dry-run) from chain data alone: the report and
//   the arena's cached bundle. The replay must end in the reported result.
// Part D — dry-run weights of arena v2 (startGame, submitTurn) for the same
//   caller, side by side with the new arena.
//
// Fee events, balances, and dry-run weights are written to --out.
// Nothing touches the DOT<->PGAS pool. No PGAS is sent to an unmapped H160.
//
//   node scripts/m3/play-arena.mjs <arena> --out <file> [--state <file>] [--skip-session] [--skip-v2]
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import {
  Binary,
  PGAS_ID,
  V1_OPTIONS,
  addrWord,
  calldata,
  connect,
  devSigner,
  dryRun,
  feeEvents,
  hex,
  h160Of,
  j,
  nativeOf,
  pgasOf,
  selector,
  submit,
  topic,
  word,
  wordInt,
} from '../m2/chain.mjs';
import { DEPS, registryAddress } from './lib.mjs';

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(2);
}, 3_600_000);

const ARENA_V2 = '0xA61f803AeEBFfF2c7568157756932D3944EDCa28';
const SET = 0;
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const [arena] = args;
const outPath = opt('--out');
const statePath = opt('--state');
if (!arena || !outPath) {
  console.error('usage: node play-arena.mjs <arena> --out <file> [--state <file>] [--skip-session] [--skip-v2]');
  process.exit(1);
}

const { client, api } = connect();
const alice = devSigner('//Alice');
const evidence = { arena, partA: { turns: [] }, partB: { turns: [] }, replay: [], v2: {}, checks: [] };
let failures = 0;
const check = (label, ok, detail) => {
  evidence.checks.push({ label, ok: !!ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' ' + detail : ''}`);
};
const save = () => writeFileSync(outPath, j(evidence));

// ── SCALE ──

function compact(buf, o) {
  const m = buf[o] & 3;
  if (m === 0) return [buf[o] >> 2, o + 1];
  if (m === 1) return [buf.readUInt16LE(o) >> 2, o + 2];
  if (m === 2) return [buf.readUInt32LE(o) >>> 2, o + 4];
  throw new Error('big compact');
}
const le64 = (buf, o) => buf.readBigUInt64LE(o);
const hexToBuf = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex');

/** SCALE ModeGame (oab-protocol) -> the fields the policy needs. */
function decodeGame(buf) {
  let o = 0;
  const runId = le64(buf, o);
  o += 8;
  const engineVersion = buf.readUInt32LE(o);
  o += 4;
  const setId = buf.readUInt16LE(o);
  o += 2;
  const setHash = '0x' + buf.subarray(o, o + 32).toString('hex');
  o += 32 + 8; // set hash, GameConfig (8 one-byte fields)
  let n;
  [n, o] = compact(buf, o);
  const bag = [];
  for (let i = 0; i < n; i++, o += 2) bag.push(buf.readUInt16LE(o));
  [n, o] = compact(buf, o);
  const hand = [];
  for (let i = 0; i < n; i++, o += 2) hand.push(buf.readUInt16LE(o));
  [n, o] = compact(buf, o);
  const board = [];
  for (let i = 0; i < n; i++) {
    if (buf[o] === 0) {
      board.push(null);
      o += 1;
    } else {
      board.push(buf.readUInt16LE(o + 1));
      o += 7;
    }
  }
  const [manaLimit, shopMana, round, lives, wins, phase] = buf.subarray(o, o + 6);
  return { runId, engineVersion, setId, setHash, bag, hand, board, manaLimit, shopMana, round, lives, wins, phase };
}

/** SCALE BattleReport -> fields, plus the raw SCALE slices of both boards. */
function decodeReport(buf) {
  let o = 0;
  const engineVersion = buf.readUInt32LE(o);
  const setId = buf.readUInt16LE(o + 4);
  const [round, result, wins, lives] = buf.subarray(o + 6, o + 10);
  const battleSeed = le64(buf, o + 10);
  o += 18;
  const board = () => {
    const start = o;
    let n;
    [n, o] = compact(buf, o);
    o += n * 6;
    return { n, raw: buf.subarray(start, o) };
  };
  const player = board();
  const opponent = board();
  return { engineVersion, setId, round, result, wins, lives, battleSeed, player, opponent };
}

const encAction = (actions) => {
  const parts = [actions.length << 2];
  for (const a of actions) parts.push(...(a.burn !== undefined ? [0, a.burn] : [1, a.hand, a.slot]));
  return Buffer.from(parts);
};
const bytesArg = (buf) =>
  word(32) + word(buf.length) + buf.toString('hex').padEnd(Math.ceil(buf.length / 32) * 64, '0');
const abiBytes = (hexData) => {
  const b = hexToBuf(hexData);
  const len = Number(b.readBigUInt64BE(56));
  return b.subarray(64, 64 + len);
};

// ── chain helpers ──

async function getGame(player) {
  const r = await dryRun(api, alice.address, arena, calldata('getGame(address)', addrWord(player)));
  const b = abiBytes(r.data);
  return b.length ? decodeGame(b) : null;
}

/** Revive.call tx at 2x the dry-run weight. Returns { dry, tx } or throws on a revert. */
async function prepare(origin, dest, data) {
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
      storage_deposit_limit: dep * 2n + 2_000_000_000n,
      data: Binary.fromHex(data),
    }),
  };
}

async function balances(who) {
  const out = {};
  for (const [k, ss58] of Object.entries(who)) out[k] = { native: (await nativeOf(api, ss58)).free, pgas: await pgasOf(api, ss58) };
  return out;
}

async function run(label, signer, tx, options, who) {
  const before = await balances(who);
  const r = options ? await submit(tx, signer.v1, options) : await submit(tx, signer.v0);
  const after = await balances(who);
  const step = { label, ok: r.ok, block: r.block.number, txHash: r.txHash, error: r.error, fees: feeEvents(r.events), before, after };
  console.log(`${r.ok ? 'tx  ' : 'TXFAIL'} ${label} block ${r.block.number} ${r.txHash} fees ${j(step.fees)}`);
  if (!r.ok) throw new Error(`${label}: ${r.error}`);
  return { r, step };
}

/** The corpus policy, with dry-runs of submitTurn as the rule check. */
async function policy(origin, game) {
  let actions = [];
  const board = [...game.board];
  const valid = async (acts) => {
    const d = await dryRun(api, origin, arena, calldata('submitTurn(bytes)', bytesArg(encAction(acts))));
    return d.ok && !d.revert;
  };
  for (let i = 0; i < game.hand.length; i++) {
    const slot = board.indexOf(null);
    if (slot >= 0) {
      const tryPlay = [...actions, { hand: i, slot }];
      if (await valid(tryPlay)) {
        actions = tryPlay;
        board[slot] = game.hand[i];
        continue;
      }
    }
    const tryBurn = [...actions, { burn: i }];
    if (await valid(tryBurn)) actions = tryBurn;
  }
  return encAction(actions);
}

const toHex = (x) => (typeof x === 'string' ? x : x instanceof Uint8Array ? hex(x) : x.asHex());
const REPORTED = topic('BattleReported(address,uint64,bytes)');
function reportsOf(events) {
  return events
    .filter((e) => e.type === 'Revive' && e.value.type === 'ContractEmitted')
    .map((e) => e.value.value)
    .filter((v) => toHex(v.topics[0]).toLowerCase() === REPORTED.toLowerCase())
    .map((v) => {
      const data = toHex(v.data);
      return { player: '0x' + toHex(v.topics[1]).toLowerCase().slice(-40), report: decodeReport(abiBytes(data)), raw: data };
    });
}

/** Play `signer`'s turns for `player` until game over. `firstV1` sends turn 1 on V1. */
async function playToEnd(signer, player, part, who, firstV1 = false) {
  let n = 0;
  for (;;) {
    const g = await getGame(player);
    if (!g) throw new Error('no game');
    if (g.phase !== 0) return g;
    const action = await policy(signer.address, g);
    const data = calldata('submitTurn(bytes)', bytesArg(action));
    const { dry, tx } = await prepare(signer.address, arena, data);
    const v1 = firstV1 && n === 0;
    const { r, step } = await run(`submitTurn round ${g.round}${v1 ? ' (V1)' : ''}`, signer, tx, v1 ? V1_OPTIONS : null, who);
    const reps = reportsOf(r.events);
    part.turns.push({
      ...step,
      round: g.round,
      pipeline: v1 ? 'V1' : 'V0',
      action: '0x' + action.toString('hex'),
      ref_time: dry.weight.ref_time,
      proof_size: dry.weight.proof_size,
      deposit: dry.deposit?.value ?? 0n,
      reports: reps.map((x) => ({ player: x.player, ...x.report, player: x.player, raw: x.raw })),
    });
    check(`turn ${g.round} reports for ${player}`, reps.length === 1 && reps[0].player === player.toLowerCase());
    n += 1;
    save();
    if (n > 40) throw new Error('game does not end');
  }
}

try {
  const deps = {};
  for (const [k, [name, v]] of Object.entries(DEPS)) deps[k] = await registryAddress(api, alice.address, name, v);
  evidence.deps = deps;
  alice.h160 = await h160Of(api, alice.address);
  const whoA = { alice: alice.address };

  // ── Part A ──
  if (await getGame(alice.h160)) {
    const { tx } = await prepare(alice.address, arena, calldata('abandonGame()'));
    await run('abandonGame (leftover)', alice, tx, null, whoA);
  }
  const start = await prepare(alice.address, arena, calldata('startGame(uint16)', word(SET)));
  evidence.partA.startDry = { ref_time: start.dry.weight.ref_time, proof_size: start.dry.weight.proof_size, deposit: start.dry.deposit?.value };
  const s = await run('startGame (Alice)', alice, start.tx, null, whoA);
  evidence.partA.start = s.step;
  const g0 = await getGame(alice.h160);
  check('Alice has a game on set 0, engine 1', g0 && g0.setId === SET && g0.engineVersion === 1 && g0.round === 1, j(g0 && { run: g0.runId, hand: g0.hand }));
  const content = deps.content;
  const pinned = await dryRun(api, alice.address, content, calldata('setHash(uint16)', word(SET)));
  check('game pins Content setHash', g0.setHash === pinned.data, g0.setHash);
  const gEnd = await playToEnd(alice, alice.h160, evidence.partA, whoA);
  check('game over', gEnd.phase === 2 && (gEnd.lives === 0 || gEnd.wins >= 10), j({ wins: gEnd.wins, lives: gEnd.lives, round: gEnd.round }));
  const end = await prepare(alice.address, arena, calldata('endGame()'));
  evidence.partA.endDry = { ref_time: end.dry.weight.ref_time, proof_size: end.dry.weight.proof_size };
  evidence.partA.end = (await run('endGame (Alice)', alice, end.tx, null, whoA)).step;
  check('game cleared after endGame', (await getGame(alice.h160)) === null);
  save();

  // ── Part C: replay every Part A battle through @oab/engine ──
  const bundle = abiBytes((await dryRun(api, alice.address, arena, calldata('getSetBundle(uint16)', word(SET)))).data);
  for (const t of evidence.partA.turns) {
    const rep = decodeReport(abiBytes(t.reports[0].raw));
    const seed = Buffer.alloc(8);
    seed.writeBigUInt64LE(rep.battleSeed);
    const input = Buffer.concat([rep.player.raw, rep.opponent.raw, seed, bundle, Buffer.from([5])]);
    const d = await dryRun(api, alice.address, deps.engine, calldata('replayBattle(bytes)', bytesArg(input)));
    const ev = abiBytes(d.data);
    const last = [ev[ev.length - 2], ev[ev.length - 1]];
    const ok = d.ok && !d.revert && last[0] === 6 && last[1] === rep.result;
    evidence.replay.push({ round: rep.round, result: rep.result, events_bytes: ev.length, last, ok, ref_time: d.weight.ref_time, proof_size: d.weight.proof_size });
    check(`replay round ${rep.round} ends in result ${rep.result}`, ok, `${ev.length} event bytes`);
  }
  save();

  // ── Part B: a session key plays for Alice ──
  if (!args.includes('--skip-session')) {
    // A throwaway testnet key: the public dev phrase at a random path.
    const path = '//oab-m3/' + randomBytes(8).toString('hex');
    if (statePath) writeFileSync(statePath, j({ path, note: 'testnet throwaway session key (M3 live check)' }));
    const key = devSigner(path);
    const who = { alice: alice.address, key: key.address };
    const PGAS_BUDGET = 120_000_000n;
    const NATIVE_BUDGET = 3_000_000_000_000n; // 3 PAS: accept deposit, V0 fees
    const fund = api.tx.Utility.batch_all({
      calls: [
        api.tx.Assets.transfer_keep_alive({ id: PGAS_ID, target: { type: 'Id', value: key.address }, amount: PGAS_BUDGET }).decodedCall,
        api.tx.Balances.transfer_keep_alive({ dest: { type: 'Id', value: key.address }, value: NATIVE_BUDGET }).decodedCall,
      ],
    });
    evidence.partB.fund = (await run('fund key (PGAS to SS58 + native)', alice, fund, null, who)).step;
    key.h160 = await h160Of(api, key.address);
    const mapped = await api.query.Revive.OriginalAccount.getValue(key.h160, { at: 'best' });
    check('key account is mapped (auto-map on creation)', !!mapped, key.h160);
    evidence.partB.key = key.h160;

    const now = (await api.query.Timestamp.Now.getValue({ at: 'best' })) / 1000n;
    const offer = await prepare(alice.address, deps.identity, calldata('registerSession(address,uint64)', addrWord(key.h160), word(now + 3600n)));
    evidence.partB.offer = (await run('Identity.registerSession(key)', alice, offer.tx, null, who)).step;
    const accept = await prepare(key.address, deps.identity, calldata('acceptSession(address)', addrWord(alice.h160)));
    evidence.partB.accept = (await run('Identity.acceptSession(alice) (key)', key, accept.tx, null, who)).step;

    const kstart = await prepare(key.address, arena, calldata('startGame(uint16)', word(SET)));
    evidence.partB.start = (await run('startGame (key, for Alice)', key, kstart.tx, null, who)).step;
    check('the key started ALICE\'s game', (await getGame(alice.h160))?.phase === 0 && (await getGame(key.h160)) === null);
    const gk = await playToEnd(key, alice.h160, evidence.partB, who, true);
    const kend = await prepare(key.address, arena, calldata('endGame()'));
    evidence.partB.end = (await run('endGame (key)', key, kend.tx, null, who)).step;
    check('key game over and ended', gk.phase === 2 && (await getGame(alice.h160)) === null);
    const v1 = evidence.partB.turns.find((t) => t.pipeline === 'V1');
    const pgasFee = v1?.fees.find((f) => f.event === 'PgasAllowance.PGASFeePaid');
    check('V1 turn paid its fee in PGAS, no native', !!pgasFee && v1.before.key.native === v1.after.key.native, j(pgasFee));

    const revoke = await prepare(alice.address, deps.identity, calldata('revokeSession()'));
    evidence.partB.revoke = (await run('Identity.revokeSession (Alice)', alice, revoke.tx, null, who)).step;
    const dead = await dryRun(api, key.address, arena, calldata('startGame(uint16)', word(SET)));
    const invalid = '0x' + selector('InvalidSession(address)');
    check('revoked key reverts InvalidSession(key)', dead.ok && dead.revert && dead.data.startsWith(invalid) && dead.data.endsWith(key.h160.slice(2)), dead.data);

    // Return what is left (Assets.transfer_all keeps nothing on the key).
    const back = api.tx.Utility.batch_all({
      calls: [
        api.tx.Assets.transfer_all({ id: PGAS_ID, dest: { type: 'Id', value: alice.address }, keep_alive: false }).decodedCall,
        api.tx.Balances.transfer_all({ dest: { type: 'Id', value: alice.address }, keep_alive: false }).decodedCall,
      ],
    });
    try {
      evidence.partB.drain = (await run('drain key to Alice', key, back, null, who)).step;
    } catch (e) {
      evidence.partB.drainError = e.message;
      console.log('drain failed (left on the throwaway key):', e.message);
    }
    save();
  }

  // ── Part D: arena v2 side by side ──
  if (!args.includes('--skip-v2')) {
    const v2start = await dryRun(api, alice.address, ARENA_V2, calldata('startGame(uint16)', word(SET)));
    evidence.v2.startDry = { ref_time: v2start.weight.ref_time, proof_size: v2start.weight.proof_size, revert: v2start.revert, seed: v2start.data };
    let state = await dryRun(api, alice.address, ARENA_V2, calldata('getGameState()'));
    if (abiBytes(state.data).length === 0) {
      const { tx } = await prepare(alice.address, ARENA_V2, calldata('startGame(uint16)', word(SET)));
      evidence.v2.start = (await run('arena v2 startGame (Alice)', alice, tx, null, whoA)).step;
    }
    const empty = Buffer.from([0]);
    const t = await dryRun(api, alice.address, ARENA_V2, calldata('submitTurn(bytes)', bytesArg(empty)));
    const mine = await dryRun(api, alice.address, arena, calldata('startGame(uint16)', word(SET)));
    evidence.v2.turnDry = { ref_time: t.weight.ref_time, proof_size: t.weight.proof_size, seed: t.data };
    evidence.v3startDry = { ref_time: mine.weight.ref_time, proof_size: mine.weight.proof_size };
    check('arena v2 dry-runs ran', t.ok && v2start.ok, j(evidence.v2));
    const { tx: ab } = await prepare(alice.address, ARENA_V2, calldata('abandonGame()'));
    evidence.v2.abandon = (await run('arena v2 abandonGame (Alice)', alice, ab, null, whoA)).step;
  }
} catch (e) {
  console.error('ERROR', e.message);
  evidence.error = e.message;
  failures += 1;
} finally {
  evidence.failures = failures;
  save();
  client.destroy();
}
console.log(failures ? `${failures} FAILED` : 'ALL OK');
setTimeout(() => process.exit(failures ? 1 : 0), 100);
