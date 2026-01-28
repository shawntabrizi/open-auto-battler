import { Binary } from "polkadot-api";

/**
 * List of enum variants that use #[serde(tag = "type", content = "data")]
 */
const DATA_WRAPPED_VARIANTS = [
  "StatValueCompare", "StatStatCompare", "UnitCount", "IsPosition", "And", "Or", "Not",
  "Position", "Adjacent", "Random", "Standard", "All"
];

/**
 * Helper to convert Map or Entries array to a plain object.
 */
const mapToRecord = (val: any, converter: (v: any) => any): Record<string, any> => {
  const res: Record<string, any> = {};
  if (val instanceof Map) {
    val.forEach((v, k) => {
      const keyStr = typeof k === 'object' && k !== null && 'value' in k ? String(k.value) : String(k);
      res[keyStr] = converter(v);
    });
  } else if (Array.isArray(val)) {
    // Check if it looks like entries [[k, v], ...]
    for (const item of val) {
      if (Array.isArray(item) && item.length === 2) {
        const k = item[0];
        const v = item[1];
        const keyStr = typeof k === 'object' && k !== null && 'value' in k ? String(k.value) : String(k);
        res[keyStr] = converter(v);
      }
    }
  }
  return res;
};

/**
 * Deep flattens any value to a plain JSON-safe object.
 * - Converts undefined to null (for Option::None)
 * - Converts BigInt to number
 * - Strips Proxies and class instances to plain objects
 */
const deepFlatten = (val: any): any => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'boolean' || typeof val === 'string' || typeof val === 'number') return val;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'function') return null;

  if (val instanceof Map) {
    return mapToRecord(val, deepFlatten);
  }

  if (Array.isArray(val)) {
    // If it's an array of pairs, it MIGHT be a map, but we'll keep it as an array
    // unless we specifically know we want a map. For deepFlatten, we'll keep it
    // as an array to be safe, unless it's explicitly a Map instance.
    return val.map(deepFlatten);
  }

  if (typeof val === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      result[key] = deepFlatten(val[key]);
    }
    return result;
  }

  return val;
};

/**
 * Converts on-chain data (from PAPI) to the format expected by the WASM engine (Serde).
 */
export const chainStateToWasm = (val: any): any => {
  if (val === null || val === undefined) return val;

  // Convert BigInt first
  if (typeof val === 'bigint') {
    if (val > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
    if (val < Number.MIN_SAFE_INTEGER) return Number.MIN_SAFE_INTEGER;
    return Number(val);
  }

  // Robust check for Binary
  if (val && typeof val === 'object' && typeof val.asText === 'function' && val.asBytes) {
    return val.asText();
  }

  // Robust check for PAPI Enum
  if (val && typeof val === 'object' && 'type' in val && 'value' in val) {
    const type = val.type;
    const value = val.value;

    if (value === undefined) {
      if (type === "None") return { type };
      return type;
    }

    const processedValue = chainStateToWasm(value);

    if (processedValue && typeof processedValue === 'object' && !Array.isArray(processedValue)) {
       if (DATA_WRAPPED_VARIANTS.includes(type)) {
         return { type, data: processedValue };
       } else {
         return { type, ...processedValue };
       }
    }
    return { [type]: processedValue };
  }

  if (val instanceof Map) {
    return mapToRecord(val, chainStateToWasm);
  }

  if (Array.isArray(val)) {
    return val.map(chainStateToWasm);
  }

  if (typeof val === 'object') {
    const res: Record<string, any> = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        try {
          res[key] = chainStateToWasm(val[key]);
        } catch { /* ignore */ }
      }
    }
    return res;
  }

  return val;
};

/**
 * Specifically convert map-like data (Map or entries array) to a Record.
 */
export const ensureRecord = (val: any): Record<string, any> => {
  if (val instanceof Map) return mapToRecord(val, prepareForJsonBridge);
  if (Array.isArray(val)) return mapToRecord(val, prepareForJsonBridge);
  if (val && typeof val === 'object') return prepareForJsonBridge(val);
  return {};
};

/**
 * Prepares a PAPI state object for safe JSON stringification.
 * Combines chainStateToWasm conversion with deep flattening.
 *
 * Usage:
 *   const clean = prepareForJsonBridge(papiState);
 *   const json = JSON.stringify(clean);
 *   engine.init_from_json(json, seed);
 */
export const prepareForJsonBridge = (val: any): any => {
  // First convert PAPI-specific types (enums, Binary)
  const converted = chainStateToWasm(val);
  // Then deep flatten to ensure all Proxies/Classes are stripped
  return deepFlatten(converted);
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

/**
 * Safely extracts game_seed from chain state as a BigInt.
 * This is required because wasm-bindgen binds Rust u64 to JavaScript BigInt.
 * Returns 0n if seed cannot be extracted.
 */
export const extractSeedBigInt = (chainState: any): bigint => {
  if (!chainState) return 0n;

  // The field is game_seed in GameState
  const seed = chainState.game_seed ?? chainState.seed;
  if (seed === undefined || seed === null) return 0n;

  if (typeof seed === 'bigint') {
    return seed;
  }

  if (typeof seed === 'number') {
    return BigInt(seed);
  }

  return 0n;
};

/**
 * Safely extracts game_seed from chain state as a number.
 * Returns 0 if seed cannot be extracted.
 * @deprecated Use extractSeedBigInt for WASM interop with u64 types
 */
export const extractSeed = (chainState: any): number => {
  if (!chainState) return 0;

  // The field is game_seed in GameState
  const seed = chainState.game_seed ?? chainState.seed;
  if (seed === undefined || seed === null) return 0;

  if (typeof seed === 'bigint') {
    // Use modulo to keep it in safe range while preserving randomness
    return Number(seed % BigInt(Number.MAX_SAFE_INTEGER));
  }

  if (typeof seed === 'number') return seed;

  return 0;
};
