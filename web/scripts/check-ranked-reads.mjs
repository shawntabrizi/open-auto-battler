// Read-only check of the arena's ranked-play and badge views, and of the
// OAB Collectibles item metadata, against the live chain. Decodes with the
// frontend's own decoders (src/contract/codec.ts, via Node type stripping) and
// reads with the same fallback origin the app uses for public views. Sends no
// transactions. Run from web/:  node scripts/check-ranked-reads.mjs
import { readFileSync } from 'node:fs';
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { createContractFromClient, QUERY_FALLBACK_ORIGIN } from '@parity/product-sdk-contracts';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import {
  decodeBadgeConfig,
  decodeBadges,
  decodeBestRun,
  decodeLeaderboard,
  hexToBytes,
} from '../src/contract/codec.ts';

const RPC_URL = 'wss://paseo-asset-hub-next-rpc.polkadot.io';
// OAB's product context (contract/README.md); src/contract/personhood.ts derives it.
const OAB_CONTEXT = '0x51dccb5fc990cce21a58dcecc3334babcea01f0f034567f0d64ca4c423356012';
const SETS = [0, 1, 2];
const COLLECTIBLES = '0x0000001d00000000000000000000000005200000';
const SLOTS = ['board_bg', 'hand_bg', 'card_style', 'avatar', 'card_art', 'theme'];
// The deployer account's H160 (any address works; most hold no badges).
const SAMPLE_PLAYER = '0x704eAd03A0a7c8b06c6EBbde97934AdC24F9f5f7';

const cdm = JSON.parse(readFileSync(new URL('../cdm.json', import.meta.url)));
const ADDRESS = cdm.contracts['@oab/arena'].address;
const ABI = cdm.contracts['@oab/arena'].abi;
const ITEM_METADATA_ABI = [
  {
    type: 'function',
    name: 'itemMetadata',
    stateMutability: 'view',
    inputs: [
      { name: 'item', type: 'uint32' },
      { name: 'key', type: 'bytes' },
    ],
    outputs: [{ name: 'value', type: 'bytes' }],
  },
];

const client = createClient(getWsProvider(RPC_URL));
const log = (...a) => console.log('[reads]', ...a);
const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const opts = { origin: QUERY_FALLBACK_ORIGIN };
  const arena = createContractFromClient(client, paseo_asset_hub, ADDRESS, ABI, {
    defaultOrigin: QUERY_FALLBACK_ORIGIN,
  });
  const q = async (c, name, ...args) => {
    const r = await c[name].query(...args, opts);
    check(r.success, `${name} dry-run failed: ${json(r.value)}`);
    return r.value;
  };
  log('arena', ADDRESS);

  const ctx = await q(arena, 'getPersonhoodContext');
  check(ctx.toLowerCase() === OAB_CONTEXT, `context ${ctx} != ${OAB_CONTEXT}`);
  log('getPersonhoodContext = OAB product context');

  const config = decodeBadgeConfig(await q(arena, 'getBadgeConfig'));
  check(json(config) === json({ collection: 30, items: [0, 1] }), `badge config ${json(config)}`);
  log('getBadgeConfig', json(config));

  for (const s of SETS) {
    const board = decodeLeaderboard(await q(arena, 'getLeaderboard', s, 0, 100));
    check(
      board.every((e, i) => e.setId === s && (i === 0 || board[i - 1].wins >= e.wins)),
      `set ${s}: board not sorted or wrong set: ${json(board)}`
    );
    log(`getLeaderboard(${s}): ${board.length} entries`, board.length ? json(board[0]) : '');
    if (board[0]) {
      const rank = await q(arena, 'getPlayerRank', s, board[0].alias);
      const best = decodeBestRun(await q(arena, 'getBestRun', s, board[0].alias));
      check(rank === 1 && best !== null, `top alias rank ${rank}, best ${json(best)}`);
    }
  }
  const zero = '0x' + '00'.repeat(32);
  check((await q(arena, 'getPlayerRank', 0, zero)) === 0, 'zero alias has a rank');
  check(decodeBestRun(await q(arena, 'getBestRun', 0, zero)) === null, 'zero alias has a best run');
  log('getPlayerRank / getBestRun of an unknown alias: 0 / none');

  const badges = decodeBadges(await q(arena, 'getBadges', SAMPLE_PLAYER));
  check(Array.isArray(badges), 'getBadges did not decode');
  log(`getBadges(${SAMPLE_PLAYER}):`, json(badges));

  const collection = createContractFromClient(client, paseo_asset_hub, COLLECTIBLES, ITEM_METADATA_ABI, {
    defaultOrigin: QUERY_FALLBACK_ORIGIN,
  });
  const utf8 = (hex) => new TextDecoder().decode(hexToBytes(hex));
  const key = (k) => '0x' + Buffer.from(k).toString('hex');
  for (let item = 0; item <= 8; item++) {
    const slot = utf8(await q(collection, 'itemMetadata', item, key('oab.slot')));
    const name = utf8(await q(collection, 'itemMetadata', item, key('oab.name')));
    const asset = utf8(await q(collection, 'itemMetadata', item, key('oab.asset')));
    check(
      SLOTS.includes(slot) && name && asset.startsWith('ipfs://'),
      `item ${item}: ${slot} ${name} ${asset}`
    );
    log(`collection 29 item ${item}: ${slot} "${name}"`);
  }

  log('✅ RANKED/BADGE/ITEM READS DECODE against', ADDRESS);
}

main()
  .catch((e) => {
    console.error('[reads] FAILED:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => client.destroy());
