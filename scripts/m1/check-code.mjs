// eth_getCode for a deployed contract, compared with a local .polkavm blob.
//   node check-code.mjs <address> <blob.polkavm> [eth rpc url]
import { readFileSync } from 'fs';

const [address, blobPath, url = 'https://eth-rpc-paseo-next.polkadot.io'] = process.argv.slice(2);
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getCode',
    params: [address, 'latest'],
  }),
});
const { result, error } = await res.json();
if (!result) throw new Error(JSON.stringify(error));
const onchain = Buffer.from(result.slice(2), 'hex');
const local = readFileSync(blobPath);
const same = onchain.equals(local);
console.log(`${address} code ${onchain.length} bytes, equals ${blobPath}: ${same}`);
process.exit(onchain.length > 0 && same ? 0 : 1);
