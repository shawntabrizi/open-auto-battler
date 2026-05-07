#!/usr/bin/env bun
/**
 * Quick smoke test: read a few cards/sets via @dotdm/cdm against the local zombienet.
 * Verifies the sdk-ink trace_call patch is letting queries through.
 */
import { Binary, createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { createCdm } from '@dotdm/cdm';
import cdmJson from '../cdm.json' with { type: 'json' };
import '../.cdm/cdm.d.ts';

const c = createClient(withPolkadotSdkCompat(getWsProvider('ws://127.0.0.1:10020')));
const cdm = createCdm(cdmJson, { client: c });
const arena = cdm.getContract('@oab/arena');

for (const id of [0, 5, 50, 110]) {
  const r = await arena.getCard.query(id);
  const len = r.value instanceof Binary ? r.value.asBytes().length : 0;
  console.log(`getCard(${id}): success=${r.success} bytes=${len}`);
}
for (const id of [0, 1, 2]) {
  const r = await arena.getSet.query(id);
  const len = r.value instanceof Binary ? r.value.asBytes().length : 0;
  console.log(`getSet(${id}):  success=${r.success} bytes=${len}`);
}

cdm.destroy();
c.destroy();
