// Free check (nothing is submitted) that the transactions of a registry
// session are valid on pipeline V1 with the fee in PGAS, built the way the
// app builds them: `@parity/product-sdk-contracts` `.prepare()` for the
// Revive calls, the app's V1 options (src/contract/v1.ts), and
// polkadot-api's VerifyMultiSignature creator (src/contract/registrySession.ts).
//
//   1. setup:   batch_all[ Assets.transfer_keep_alive(PGAS, key, 1.5 G),
//                          Identity.registerSession(key, expiresAt) ]
//   2. session: batch_all[ Identity.acceptSession(owner), Arena.startGame(0) ]
//
// //Alice signs both (she holds PGAS for the fee; the test host cannot sign
// V1 for a product account, and no session key holds PGAS). Each is checked
// with TaggedTransactionQueue.validate_transaction, and as a V0 transaction
// for contrast. The 1.5 G transfer is not checked by validation (only the
// fee is), so Alice's low PGAS does not matter.
//
//   node scripts/check-v1-session.mjs
import { readFileSync } from 'node:fs';
import { createClient, Enum, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getTxCreator, getVerifyMultiSignatureTxCreator } from 'polkadot-api/tx-creator';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  ss58Encode,
} from '@polkadot-labs/hdkd-helpers';
import { createContractFromClient } from '@parity/product-sdk-contracts';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { ss58ToH160 } from '@parity/product-sdk-address';
import { V1_OPTIONS } from '../src/contract/v1.ts';

const RPC = 'wss://paseo-asset-hub-next-rpc.polkadot.io';
const PGAS = 2_000_000_000;
const cdm = JSON.parse(readFileSync(new URL('../cdm.json', import.meta.url), 'utf8')).contracts;

const client = createClient(getWsProvider(RPC));
const api = client.getTypedApi(paseo_asset_hub);
const unsafe = client.getUnsafeApi();
const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)));
const alice = derive('//Alice');
const aliceSs58 = ss58Encode(alice.publicKey);
const key = derive('//oab-m5-v1-check'); // never funded; only its address is used
const keySs58 = ss58Encode(key.publicKey);
const v1 = getVerifyMultiSignatureTxCreator(alice.publicKey, 'Sr25519', alice.sign);
const v0 = getTxCreator(alice.publicKey, 'Sr25519', alice.sign);

const identity = createContractFromClient(
  client,
  paseo_asset_hub,
  cdm['@oab/identity'].address,
  cdm['@oab/identity'].abi,
  { defaultOrigin: aliceSs58 }
);
const arena = createContractFromClient(
  client,
  paseo_asset_hub,
  cdm['@oab/arena'].address,
  cdm['@oab/arena'].abi,
  { defaultOrigin: aliceSs58 }
);
const unwrap = (r, label) => {
  if (!r.ok) throw new Error(`${label}: ${r.error.message}`);
  return r.value.decodedCall;
};

function body(bytes) {
  const b = Buffer.from(bytes);
  const mode = b[0] & 3;
  return Binary.fromHex('0x' + b.subarray(mode === 0 ? 1 : mode === 1 ? 2 : 4).toString('hex'));
}

async function validate(label, tx, creator, options) {
  const bytes = await tx.create(creator, options);
  const best = (await client.getBestBlocks())[0].hash;
  const r = await unsafe.apis.TaggedTransactionQueue.validate_transaction(
    { type: 'External' },
    body(bytes),
    best,
    { at: best }
  );
  const version = Buffer.from(bytes)[Buffer.from(bytes)[0] & 3 ? 2 : 1] ?? 0;
  const out = r.success
    ? 'valid'
    : `invalid ${JSON.stringify(r.value, (_, v) => (typeof v === 'bigint' ? `${v}` : v))}`;
  console.log(`${label.padEnd(34)} extrinsic version byte 0x${version.toString(16)}  ${out}`);
  return r.success;
}

const now = (await api.query.Timestamp.Now.getValue({ at: 'best' })) / 1000n;
const register = await identity.registerSession.prepare(ss58ToH160(keySs58), now + 6n * 86_400n, {
  gasLimit: { ref_time: 2_000_000_000n, proof_size: 180_000n },
  storageDepositLimit: 300_000_000n,
});
const setup = api.tx.Utility.batch_all({
  calls: [
    api.tx.Assets.transfer_keep_alive({
      id: PGAS,
      target: Enum('Id', keySs58),
      amount: 1_500_000_000n,
    }).decodedCall,
    unwrap(register, 'registerSession.prepare'),
  ],
});
const accept = await identity.acceptSession.prepare(ss58ToH160(aliceSs58), {
  gasLimit: { ref_time: 2_000_000_000n, proof_size: 180_000n },
  storageDepositLimit: 300_000_000n,
});
const start = await arena.startGame.prepare(0);
const first = api.tx.Utility.batch_all({
  calls: [unwrap(accept, 'acceptSession.prepare'), unwrap(start, 'startGame.prepare')],
});

const pgas = (await api.query.Assets.Account.getValue(PGAS, aliceSs58, { at: 'best' }))?.balance;
console.log(`//Alice PGAS ${pgas}; nothing below is submitted`);
const results = [
  await validate('setup batch, V1 (VerifyMultiSig)', setup, v1, V1_OPTIONS),
  await validate('first session call, V1', first, v1, V1_OPTIONS),
];
await validate('setup batch, V0 (classic, contrast)', setup, v0);
client.destroy();
if (results.includes(false)) {
  console.error('FAIL: a V1 transaction is not valid');
  process.exit(1);
}
console.log('ok: both V1 transactions are valid (fee in PGAS)');
process.exit(0);
