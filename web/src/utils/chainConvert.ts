import { Binary } from "polkadot-api";

/**
 * Converts WASM actions to on-chain format.
 * This is used when submitting a turn from the frontend to the blockchain.
 * The WASM engine provides actions as JSON, which are then converted to
 * the format expected by PAPI (including Binary for strings).
 */
export const wasmActionToChain = (val: any): any => {
  if (val === null || val === undefined) return val;

  if (typeof val === 'object' && !Array.isArray(val)) {
    const res: any = {};
    for (const key in val) {
      if ((key === 'template_id' || key === 'name' || key === 'description' || key === 'ability_name') && typeof val[key] === 'string') {
        res[key] = Binary.fromText(val[key]);
      } else {
        res[key] = wasmActionToChain(val[key]);
      }
    }
    return res;
  }

  if (Array.isArray(val)) {
    return val.map(wasmActionToChain);
  }

  return val;
};