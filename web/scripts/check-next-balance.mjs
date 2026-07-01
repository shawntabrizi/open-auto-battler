import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';

const URL = 'wss://paseo-asset-hub-next-rpc.polkadot.io';
const ADDR = '5CUbpNYAePqCdFkS6BWqVF4RDaAcsueW923DrJTnDUXHst7v';

const client = createClient(getWsProvider(URL));
try {
  const spec = await client.getChainSpecData();
  const api = await client.getUnsafeApi();
  const acc = await api.query.System.Account.getValue(ADDR);
  console.log('chain:', spec.name);
  console.log('address:', ADDR);
  console.log('free:', acc.data.free.toString(), 'planck');
} catch (e) {
  console.error('ERROR:', e?.message || e);
} finally {
  client.destroy();
}
