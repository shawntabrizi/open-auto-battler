import { Binary, Enum } from "polkadot-api";

/**
 * List of enum variants that use #[serde(tag = "type", content = "data")]
 */
const DATA_WRAPPED_VARIANTS = [
  "StatValueCompare", "StatStatCompare", "UnitCount", "IsPosition", "And", "Or", "Not",
  "Position", "Adjacent", "Random", "Standard", "All"
];

/**
 * Converts on-chain data (from PAPI) to the format expected by the WASM engine (Serde).
 */
export const chainStateToWasm = (val: any): any => {
  if (val === null || val === undefined) return val;

  if (val instanceof Binary) {
    return val.asText();
  }

  if (val instanceof Enum) {
    const type = val.type;
    const value = val.value;

    if (value === undefined) {
      // For unit variants, check if they belong to a tagged enum type
      // Heuristic: If it's "None", "SelfUnit", etc.
      if (["None", "SelfUnit", "Allies", "Enemies", "All", "AlliesOther", "TriggerSource", "Aggressor"].includes(type)) {
         return { type };
      }
      return type; 
    }

    const processedValue = chainStateToWasm(value);

    if (typeof processedValue === 'object' && !Array.isArray(processedValue)) {
       if (DATA_WRAPPED_VARIANTS.includes(type)) {
         return { type, data: processedValue };
       } else {
         return { type, ...processedValue };
       }
    }

    return { [type]: processedValue };
  }

  if (Array.isArray(val)) {
    return val.map(chainStateToWasm);
  }

  if (typeof val === 'object') {
    const res: any = {};
    for (const key in val) {
      res[key] = chainStateToWasm(val[key]);
    }
    return res;
  }

  return val;
};

/**
 * Converts WASM actions to on-chain format.
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