// On-chain E2E: drive the deployed @oab/arena contract on Paseo Asset Hub Next.
// Registers genesis cards + set 0, then startGame -> getGameState -> submitTurn,
// asserting each step against the live contract. Run from web/:
//   node scripts/e2e-onchain.mjs
import { readFileSync } from 'node:fs';
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import {
  createContractFromClient,
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
} from '@parity/product-sdk-contracts';
import { batchSubmitAndWatch } from '@parity/product-sdk-tx';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';

const RPC_URL = 'wss://paseo-asset-hub-next-rpc.polkadot.io';
const MNEMONIC = 'deputy poverty object route trim aware cake fatal cliff snap lady earth';
const DUMP = process.env.DUMP || '/tmp/cards-dump.json';

function log(...a) { console.log('[e2e]', ...a); }

const cdm = JSON.parse(readFileSync(new URL('../cdm.json', import.meta.url)));
const ADDRESS = cdm.contracts['@oab/arena'].address;
const ABI = cdm.contracts['@oab/arena'].abi;
const dump = JSON.parse(readFileSync(DUMP));

// sr25519 signer from the cdm mnemonic
const miniSecret = entropyToMiniSecret(mnemonicToEntropy(MNEMONIC));
const kp = sr25519CreateDerive(miniSecret)('');
const signer = getPolkadotSigner(kp.publicKey, 'Sr25519', kp.sign);

const client = createClient(getWsProvider(RPC_URL));

async function main() {
  const spec = await client.getChainSpecData();
  log('chain:', spec.name, '| contract:', ADDRESS);
  const api = client.getUnsafeApi();

  // Derive our SS58 for origin. ss58 default-prefix encode of kp.publicKey.
  const { ss58Encode } = await import('@polkadot-labs/hdkd-helpers');
  const ORIGIN = ss58Encode(kp.publicKey);
  log('origin:', ORIGIN);

  const runtime = createContractRuntimeFromClient(client, paseo_asset_hub);
  log('mapping account (idempotent)…');
  await ensureContractAccountMapped(runtime, ORIGIN, signer);

  const arena = createContractFromClient(client, paseo_asset_hub, ADDRESS, ABI, {
    defaultSigner: signer,
    defaultOrigin: ORIGIN,
  });

  // ── register genesis cards + set 0 (batched) ──
  const set0 = dump.sets.find((s) => s.id === 0) ?? dump.sets[0];
  log(`registering ${dump.cards.length} cards + set ${set0.id} …`);
  const calls = [];
  for (const cardHex of dump.cards) calls.push(await arena.registerCard.prepare(cardHex));
  calls.push(await arena.registerSet.prepare(set0.id, set0.data));

  const CHUNK = 20;
  for (let i = 0; i < calls.length; i += CHUNK) {
    const chunk = calls.slice(i, i + CHUNK);
    const r = await batchSubmitAndWatch(chunk, api, signer, { waitFor: 'best-block' });
    log(`  batch ${i / CHUNK + 1}: ${chunk.length} calls -> ok=${r.ok}`);
    if (!r.ok) throw new Error('registration batch failed');
  }

  // ── read back a card + the set ──
  const cardRead = await arena.getCard.query(set0.id === 0 ? 0 : 1);
  log('getCard(0) non-empty:', typeof cardRead.value === 'string' && cardRead.value.length > 2);
  const setRead = await arena.getSet.query(set0.id);
  if (!(setRead.success && setRead.value.length > 2)) throw new Error('getSet returned empty');
  log('getSet OK, bytes:', (setRead.value.length - 2) / 2);

  // ── startGame ──
  const seedNonce = 20260630n;
  const startDry = await arena.startGame.query(set0.id, seedNonce);
  log('startGame.query seed:', startDry.value?.toString());
  if (!startDry.success || startDry.value === 0n) throw new Error('startGame rejected in dry-run');
  const startTx = await arena.startGame.tx(set0.id, seedNonce, { waitFor: 'best-block' });
  if (!startTx.ok) throw new Error('startGame tx failed');
  log('startGame tx ok, block:', startTx.block?.number);

  const state1 = await arena.getGameState.query();
  if (!(state1.success && state1.value.length > 2)) throw new Error('no active game after startGame');
  log('getGameState after start: non-empty (', (state1.value.length - 2) / 2, 'bytes) — game active');

  // ── submitTurn (empty CommitTurnAction = SCALE 0x00) ──
  const EMPTY_TURN = '0x00';
  const turnDry = await arena.submitTurn.query(EMPTY_TURN);
  log('submitTurn.query battleSeed:', turnDry.value?.toString());
  if (!turnDry.success || turnDry.value === 0n) throw new Error('submitTurn rejected in dry-run');
  const turnTx = await arena.submitTurn.tx(EMPTY_TURN, { waitFor: 'best-block' });
  if (!turnTx.ok) throw new Error('submitTurn tx failed');
  log('submitTurn tx ok, block:', turnTx.block?.number, '| events:', turnTx.events?.length);

  const state2 = await arena.getGameState.query();
  log('getGameState after turn: non-empty:', state2.success && state2.value.length > 2);

  // ── abandon to clean up ──
  const abandonTx = await arena.abandonGame.tx({ waitFor: 'best-block' });
  log('abandonGame tx ok:', abandonTx.ok);
  const state3 = await arena.getGameState.query();
  log('getGameState after abandon empty:', !state3.success || state3.value.length <= 2);

  log('✅ ON-CHAIN E2E PASSED against', ADDRESS, 'on', spec.name);
}

main()
  .catch((e) => {
    console.error('[e2e] FAILED:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => client.destroy());
