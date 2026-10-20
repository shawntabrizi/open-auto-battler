// Shared helpers for the M3 scripts (they also reuse scripts/m2/chain.mjs).
import { dryRun, j, selector, word, wordAddr, wordInt } from '../m2/chain.mjs';

export const REGISTRY = '0xc1a73a4f93fde65b1cb1680baead248073566cb0';
/** The exact CDM versions this arena runs against (M1, M2 status). */
export const DEPS = { identity: ['@oab/identity', 2], content: ['@oab/content', 0], engine: ['@oab/engine', 0] };
export const SETS = [0, 1, 2];

export const strTail = (s) => {
  const b = Buffer.from(s);
  return word(b.length) + b.toString('hex').padEnd(Math.ceil(b.length / 32) * 64, '0');
};

/** Registry getAddressAtVersion(name, version) -> address (throws if absent). */
export async function registryAddress(api, origin, name, version) {
  const data = '0x' + selector('getAddressAtVersion(string,uint32)') + word(64) + word(version) + strTail(name);
  const r = await dryRun(api, origin, REGISTRY, data);
  if (!r.ok || r.revert || wordInt(r.data, 0) !== 1n) throw new Error(`${name}@${version} not in registry: ${j(r)}`);
  return wordAddr(r.data, 1);
}

