import { Binary } from "polkadot-api";

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

  // Robust check for Binary without instanceof
  if (val && typeof val === 'object' && typeof val.asText === 'function' && val.asBytes) {
    return val.asText();
  }

  // Robust check for PAPI Enum without instanceof
  if (val && typeof val === 'object' && 'type' in val && 'value' in val) {
    const type = val.type;
    const value = val.value;

    if (value === undefined) {
      // Unit variants
      // AbilityCondition::None is tagged and needs wrapping: { type: "None" }
      // Other unit variants like TargetScope::Allies are plain: "Allies"
      if (type === "None") {
         return { type };
      }
      return type; 
    }

    const processedValue = chainStateToWasm(value);

    // If it's an object (not array/primitive), handle tagging
    if (processedValue && typeof processedValue === 'object' && !Array.isArray(processedValue)) {
       if (DATA_WRAPPED_VARIANTS.includes(type)) {
         return { type, data: processedValue };
       } else {
         // Internally tagged: { type: "Variant", ...fields }
         return { type, ...processedValue };
       }
    }

    // Default: externally tagged { Variant: value }
    return { [type]: processedValue };
  }

  if (Array.isArray(val)) {
    return val.map(chainStateToWasm);
  }

  if (typeof val === 'object') {
    // Avoid processing already processed or non-plain objects
    if (val.constructor && val.constructor.name !== 'Object' && val.constructor.name !== 'Array') {
        return val;
    }
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