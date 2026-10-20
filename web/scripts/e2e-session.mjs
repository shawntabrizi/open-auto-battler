// On-chain E2E for sponsored play (proxy sessions + PGAS) on Paseo Asset Hub Next.
//
// Proves that a brand-new player who holds ONLY PGAS (never PAS) can:
//   1. sign ONE setup batch (swap a little PGAS for the proxy deposit, fund a
//      session key with PGAS, add the session key as an `Any` proxy), then
//   2. play a full run (startGame, N x submitTurn, endGame) where every call is
//      signed by the local session key — no player signature, fees in PGAS.
//
// The host normally puts PGAS on the player's product account through the
// `SmartContractAllowance` resource (a personhood-gated `claim_pgas`). A headless
// script cannot make a personhood proof, so a sponsor sends the fresh player the
// PGAS this pattern needs (from its own PGAS, or bought from the DOT<->PGAS
// pool). That is the only thing the sponsor does. Teardown returns what is left
// (and swaps the refunded proxy deposit back into the pool), so repeated runs
// barely move the pool.
//
// Run from web/:
//   node scripts/e2e-session.mjs                 # sponsor = //Alice (dev phrase)
//   SPONSOR=cdm node scripts/e2e-session.mjs     # sponsor = cdm `paseo` account
//
// The contract address and ABI come from web/cdm.json at runtime.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient, Enum } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getTxCreator } from 'polkadot-api/tx-creator';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  entropyToMnemonic,
  mnemonicToEntropy,
  ss58Decode,
  ss58Encode,
} from '@polkadot-labs/hdkd-helpers';
import { seedToAccount } from '@parity/product-sdk-keys';
import { createContractFromClient } from '@parity/product-sdk-contracts';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { randomBytes } from 'node:crypto';

const RPC_URL = process.env.RPC_URL || 'wss://paseo-asset-hub-next-rpc.polkadot.io';
const PGAS_ID = 2_000_000_000;
const NATIVE = { parents: 1, interior: Enum('Here') };
const PGAS = {
  parents: 0,
  interior: Enum('X2', [Enum('PalletInstance', 50), Enum('GeneralIndex', BigInt(PGAS_ID))]),
};
// PGAS the player hands to the session key. Covers the per-call fees of a full
// run (paid in PGAS through the pool); the rest is drained back at teardown.
const SESSION_PGAS = BigInt(process.env.SESSION_PGAS || 4_000_000_000);
// PGAS the player keeps. Contract storage deposits are taken in PGAS from the
// call's origin — the player, not the session key — plus the player's own
// setup/teardown fees.
const PLAYER_KEEP_PGAS = BigInt(process.env.PLAYER_KEEP_PGAS || 8_000_000_000);
const MAX_TURNS = Number(process.env.MAX_TURNS || 30);

const log = (...a) => console.log('[e2e-session]', ...a);
const fail = (msg) => {
  throw new Error(msg);
};

// ── accounts ────────────────────────────────────────────────────────────────

function sponsorKeypair() {
  if (process.env.SPONSOR === 'cdm') {
    // Read the mnemonic in-process only. It is never printed or written.
    const accounts = JSON.parse(readFileSync(`${homedir()}/.cdm/accounts.json`, 'utf8'));
    const phrase = accounts.paseo?.mnemonic ?? fail('no `paseo` account in ~/.cdm/accounts.json');
    return sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(phrase)))('');
  }
  return sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)))('//Alice');
}

const sponsorKp = sponsorKeypair();
const sponsor = {
  address: ss58Encode(sponsorKp.publicKey),
  signer: getTxCreator(sponsorKp.publicKey, 'Sr25519', sponsorKp.sign),
};
// Fresh, throwaway player ("product account") and session key.
const player = seedToAccount(entropyToMnemonic(randomBytes(16)), '//0', 42);
const session = seedToAccount(entropyToMnemonic(randomBytes(16)), '//0', 42);

// ── chain ───────────────────────────────────────────────────────────────────

const cdm = JSON.parse(readFileSync(new URL('../cdm.json', import.meta.url)));
const ARENA = cdm.contracts['@oab/arena'];
const client = createClient(getWsProvider(RPC_URL));
const api = client.getTypedApi(paseo_asset_hub);

async function nativeOf(address) {
  const a = await api.query.System.Account.getValue(address, { at: 'best' });
  return { free: a.data.free, reserved: a.data.reserved };
}
async function pgasOf(address) {
  const a = await api.query.Assets.Account.getValue(PGAS_ID, address, { at: 'best' });
  return a?.balance ?? 0n;
}

// Sign, submit, wait for the best block. Throws on a failed dispatch.
async function submit(label, tx, signer, opts = {}) {
  const r = await new Promise((resolve, reject) => {
    const sub = tx.createSubmitAndWatch(signer, opts).subscribe({
      next: (ev) => {
        if (ev.type === 'inBestBlock') {
          sub.unsubscribe();
          resolve(ev);
        }
      },
      error: (e) =>
        reject(
          new Error(`${label} rejected: ${e?.message ?? JSON.stringify(e, bigintJson)}`, {
            cause: e,
          })
        ),
    });
  });
  if (!r.ok) fail(`${label} dispatch failed: ${JSON.stringify(r.dispatchError, bigintJson)}`);
  return r;
}
const bigintJson = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

// The outer Proxy.proxy extrinsic succeeds even when the inner call fails; the
// inner result is in Proxy.ProxyExecuted.
function assertProxyOk(label, r) {
  const ev = r.events.find((e) => e.type === 'Proxy' && e.value.type === 'ProxyExecuted');
  if (!ev) fail(`${label}: no Proxy.ProxyExecuted event`);
  const res = ev.value.value.result;
  if (!res.success) fail(`${label}: inner call failed: ${JSON.stringify(res.value, bigintJson)}`);
}

// PGAS fee paid by the signer in this extrinsic (AssetTxFeePaid or PGASFeePaid).
function pgasFee(r) {
  for (const e of r.events) {
    if (e.value?.type === 'AssetTxFeePaid' || e.value?.type === 'PGASFeePaid') {
      return e.value.value.actual_fee;
    }
  }
  return null;
}

const toHex = (v) =>
  typeof v === 'string'
    ? v
    : v instanceof Uint8Array
      ? '0x' + Buffer.from(v).toString('hex')
      : null;
const BATTLE_REPORTED_TOPIC = '0x96fd1736ea4fbef32e328d7005021b05c7ee31f32694ddef23dd55af68e089bd';
function battleReport(r) {
  const ev = r.events.find(
    (e) =>
      e.type === 'Revive' &&
      e.value.type === 'ContractEmitted' &&
      toHex(e.value.value.topics[0])?.toLowerCase() === BATTLE_REPORTED_TOPIC
  );
  if (!ev) return null;
  const b = Buffer.from(toHex(ev.value.value.data).slice(2), 'hex');
  return {
    result: ['Victory', 'Defeat', 'Draw'][b[0]] ?? '?',
    wins: b[1],
    lives: b[2],
    round: b[3],
  };
}

async function main() {
  const spec = await client.getChainSpecData();
  log('chain:', spec.name, '| arena:', ARENA.address);
  log('sponsor:', sponsor.address);
  log('player :', player.ss58Address, player.h160Address);
  log('session:', session.ss58Address, session.h160Address);

  const asset = await api.query.Assets.Asset.getValue(PGAS_ID);
  if (!asset?.is_sufficient) fail('PGAS asset missing or not sufficient');
  const claim = await api.constants.Pgas.PgasClaimAmount();
  const ed = await api.constants.Balances.ExistentialDeposit();
  const deposit =
    (await api.constants.Proxy.ProxyDepositBase()) +
    (await api.constants.Proxy.ProxyDepositFactor());
  log(
    `PGAS sufficient=${asset.is_sufficient} min=${asset.min_balance} | claim=${claim} | proxy deposit=${deposit} | ED=${ed}`
  );

  // ── 1. sponsor: the PGAS the pattern needs, to the fresh player ──
  const nativeNeeded = deposit + ed;
  const pgasForNative = await api.apis.AssetConversionApi.quote_price_tokens_for_exact_tokens(
    PGAS,
    NATIVE,
    nativeNeeded,
    true,
    { at: 'best' }
  );
  if (!pgasForNative) fail('pool gives no quote for PGAS->NATIVE');
  const playerPgas = (pgasForNative * 110n) / 100n + SESSION_PGAS + PLAYER_KEEP_PGAS;
  // Use the sponsor's own PGAS (returned by earlier runs) first; buy the rest.
  const sponsorPgas = await pgasOf(sponsor.address);
  const own = sponsorPgas > asset.min_balance ? sponsorPgas - asset.min_balance : 0n;
  const send = own < playerPgas ? own : playerPgas;
  const buy = playerPgas - send;
  if (send > 0n) {
    await submit(
      'sponsor sends PGAS to player',
      api.tx.Assets.transfer({ id: PGAS_ID, target: Enum('Id', player.ss58Address), amount: send }),
      sponsor.signer
    );
  }
  if (buy > 0n) {
    const buyIn = await api.apis.AssetConversionApi.quote_price_tokens_for_exact_tokens(
      NATIVE,
      PGAS,
      buy,
      true,
      { at: 'best' }
    );
    if (!buyIn) fail('pool gives no quote for NATIVE->PGAS');
    await submit(
      'sponsor buys PGAS for player',
      api.tx.AssetConversion.swap_tokens_for_exact_tokens({
        path: [NATIVE, PGAS],
        amount_out: buy,
        amount_in_max: (buyIn * 105n) / 100n,
        send_to: player.ss58Address,
        keep_alive: true,
      }),
      sponsor.signer
    );
  }
  log(
    `player funded with ${playerPgas} PGAS (${send} from sponsor's PGAS, ${buy} bought from the pool)`
  );
  const p0 = await nativeOf(player.ss58Address);
  log(
    `player after "allowance": PGAS=${await pgasOf(player.ss58Address)} native free=${p0.free} reserved=${p0.reserved}`
  );
  if (p0.free !== 0n || p0.reserved !== 0n) fail('player must hold no PAS before setup');

  const mapped = await api.query.Revive.OriginalAccount.getValue(player.h160Address, {
    at: 'best',
  });
  log('player auto-mapped on PGAS receipt:', mapped !== undefined);

  // ── 2. player: ONE setup batch (the only player signature) ──
  const calls = [
    api.tx.AssetConversion.swap_tokens_for_exact_tokens({
      path: [PGAS, NATIVE],
      amount_out: nativeNeeded,
      amount_in_max: (pgasForNative * 105n) / 100n,
      send_to: player.ss58Address,
      keep_alive: false,
    }).decodedCall,
    api.tx.Assets.transfer({
      id: PGAS_ID,
      target: Enum('Id', session.ss58Address),
      amount: SESSION_PGAS,
    }).decodedCall,
    api.tx.Proxy.add_proxy({
      delegate: Enum('Id', session.ss58Address),
      proxy_type: Enum('Any'),
      delay: 0,
    }).decodedCall,
  ];
  if (mapped === undefined) calls.push(api.tx.Revive.map_account().decodedCall);
  const setup = await submit('setup batch', api.tx.Utility.batch_all({ calls }), player.signer, {
    asset: PGAS,
  });
  log(
    `setup batch ok (block ${setup.block.number}) | ${calls.length} calls | fee in PGAS: ${pgasFee(setup)}`
  );
  const p1 = await nativeOf(player.ss58Address);
  const p1Pgas = await pgasOf(player.ss58Address);
  log(`player after setup: PGAS=${p1Pgas} native free=${p1.free} reserved=${p1.reserved}`);
  const proxies = await api.query.Proxy.Proxies.getValue(player.ss58Address, { at: 'best' });
  // Compare public keys, not SS58 strings (the chain may use another prefix).
  const sessionKey = Buffer.from(session.publicKey).toString('hex');
  const isSession = (addr) => Buffer.from(ss58Decode(addr)[0]).toString('hex') === sessionKey;
  if (!proxies[0].some((p) => isSession(p.delegate) && p.proxy_type.type === 'Any')) {
    fail('session key is not an Any proxy of the player');
  }
  log('session is an Any proxy of player: true');

  // ── 3. gameplay: session key signs everything ──
  const arena = createContractFromClient(client, paseo_asset_hub, ARENA.address, ARENA.abi, {
    defaultOrigin: player.ss58Address,
  });
  const unwrap = (step, r) => (r.ok ? r.value : fail(`${step}: ${r.error?.message ?? r.error}`));
  const asSession = async (label, prepared) => {
    const call = unwrap(`${label}.prepare`, await prepared);
    const r = await submit(
      label,
      api.tx.Proxy.proxy({
        real: Enum('Id', player.ss58Address),
        force_proxy_type: undefined,
        call: call.decodedCall,
      }),
      session.signer,
      { asset: PGAS }
    );
    assertProxyOk(label, r);
    return r;
  };

  let sessionFees = 0n;
  const track = (label, r) => {
    sessionFees += pgasFee(r) ?? 0n;
    return r;
  };
  let gameActive = false;
  let turns = 0;
  let p2;
  try {
    const setId = 0;
    const startDry = await arena.startGame.query(setId);
    if (!startDry.success || startDry.value === 0n) fail('startGame rejected in dry-run');
    const g = startDry.gasRequired;
    let r = track(
      'startGame',
      await asSession(
        'startGame',
        arena.startGame.prepare(setId, {
          gasLimit: { ref_time: g.ref_time * 2n, proof_size: g.proof_size * 2n },
        })
      )
    );
    gameActive = true;
    log(`startGame ok via session (block ${r.block.number}) | fee PGAS ${pgasFee(r)}`);
    const state = await arena.getGameState.query();
    if (!(state.success && state.value.length > 2))
      fail('no active game for player after startGame');
    log('player has an active game (origin = player, signed by session)');

    // Play until the run is over: put one unit on the board each turn when a
    // dry-run accepts it, otherwise commit an empty turn.
    let over = false;
    for (; turns < MAX_TURNS && !over; turns++) {
      const action = (await pickTurn(arena)) ?? EMPTY_TURN;
      r = track('submitTurn', await asSession('submitTurn', arena.submitTurn.prepare(action)));
      const rep = battleReport(r) ?? fail('submitTurn: no BattleReported event');
      log(
        `turn ${turns + 1}: ${action === EMPTY_TURN ? 'empty' : 'play'} -> ${rep.result} | wins=${rep.wins} lives=${rep.lives} | fee PGAS ${pgasFee(r)}`
      );
      over = rep.lives === 0 || rep.wins >= 10;
    }
    if (!over) fail(`run not over after ${MAX_TURNS} turns`);

    const endDry = await arena.endGame.query();
    if (!endDry.success || !endDry.value) fail('endGame rejected in dry-run');
    r = track('endGame', await asSession('endGame', arena.endGame.prepare()));
    gameActive = false;
    log(`endGame ok via session (block ${r.block.number}) | fee PGAS ${pgasFee(r)}`);

    p2 = await nativeOf(player.ss58Address);
    const s2 = await nativeOf(session.ss58Address);
    log(
      `after run: player native free=${p2.free} reserved=${p2.reserved} | session native free=${s2.free} reserved=${s2.reserved}`
    );
    log(
      `session PGAS spent on fees for ${turns + 2} game calls: ${sessionFees} (left ${await pgasOf(session.ss58Address)})`
    );
    log(
      `player PGAS used for contract storage deposits during the run: ${p1Pgas - (await pgasOf(player.ss58Address))}`
    );
    if (s2.free !== 0n || s2.reserved !== 0n) fail('session key must never hold PAS');
    if (p2.free > p1.free) fail('player native grew during play (fees must not come from PAS)');
  } catch (e) {
    log('game phase failed:', e.message);
    log(
      `  session PGAS=${await pgasOf(session.ss58Address)} player PGAS=${await pgasOf(player.ss58Address)}`
    );
    throw e;
  } finally {
    if (gameActive) {
      log('cleanup: abandoning the unfinished game');
      await asSession('abandonGame', arena.abandonGame.prepare()).catch((e) =>
        log('abandon failed:', e.message)
      );
    }
    await teardown({ deposit });
  }

  log(
    `PASSED: ${turns + 2} game calls signed by the session key; the player signed 1 setup batch and held no PAS before it`
  );
}

// SCALE CommitTurnAction { actions: Vec<TurnAction> }.
const EMPTY_TURN = '0x00';
const playFromHand = (hand, slot) => '0x04' + '01' + hex8(hand) + hex8(slot);
const burnThenPlay = (burn, hand, slot) =>
  '0x08' + '00' + hex8(burn) + '01' + hex8(hand) + hex8(slot);
const hex8 = (n) => n.toString(16).padStart(2, '0');

// First turn action the contract accepts in a dry-run: play a card (burning
// one card for mana if needed). The contract signals a rejected turn with a
// zero battle seed, not a revert. Returns null when nothing fits.
async function pickTurn(arena) {
  const accepted = async (a) => {
    const q = await arena.submitTurn.query(a);
    return q.success && q.value !== 0n;
  };
  for (let slot = 0; slot < 5; slot++) {
    for (let hand = 0; hand < 5; hand++) {
      const a = playFromHand(hand, slot);
      if (await accepted(a)) return a;
    }
  }
  for (let burn = 0; burn < 5; burn++) {
    for (let hand = 0; hand < 4; hand++) {
      const a = burnThenPlay(burn, hand, 0);
      if (await accepted(a)) return a;
    }
  }
  return null;
}

// Session returns its PGAS to the player (silent); the player removes the proxy
// and swaps the refunded deposit back into the pool; leftovers go back to the
// sponsor.
async function teardown({ deposit }) {
  await submit(
    'session drain',
    api.tx.Assets.transfer_all({
      id: PGAS_ID,
      dest: Enum('Id', player.ss58Address),
      keep_alive: false,
    }),
    session.signer,
    { asset: PGAS }
  ).catch((e) => log('session drain failed:', e.message));
  const { free } = await nativeOf(player.ss58Address);
  await submit(
    'remove proxy + return deposit to pool',
    api.tx.Utility.batch_all({
      calls: [
        api.tx.Proxy.remove_proxy({
          delegate: Enum('Id', session.ss58Address),
          proxy_type: Enum('Any'),
          delay: 0,
        }).decodedCall,
        api.tx.AssetConversion.swap_exact_tokens_for_tokens({
          path: [NATIVE, PGAS],
          amount_in: deposit + free,
          amount_out_min: 1n,
          send_to: sponsor.address,
          keep_alive: false,
        }).decodedCall,
      ],
    }),
    player.signer,
    { asset: PGAS }
  );
  await submit(
    'player returns PGAS',
    api.tx.Assets.transfer_all({
      id: PGAS_ID,
      dest: Enum('Id', sponsor.address),
      keep_alive: false,
    }),
    player.signer,
    { asset: PGAS }
  );
  const p3 = await nativeOf(player.ss58Address);
  const left = await api.query.Proxy.Proxies.getValue(player.ss58Address, { at: 'best' });
  log(
    `teardown ok: proxies left=${left[0].length} | player native free=${p3.free} reserved=${p3.reserved} | sponsor PGAS=${await pgasOf(sponsor.address)}`
  );
}

main()
  .catch((e) => {
    console.error('[e2e-session] FAILED:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => client.destroy());
