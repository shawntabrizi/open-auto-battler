import { Binary, Enum } from 'polkadot-api';
import { getLookupFn } from '@polkadot-api/metadata-builders';
import {
  decAnyMetadata,
  unifyMetadata,
  type UnifiedMetadata,
} from '@polkadot-api/substrate-bindings';

type MetadataVar =
  | { type: 'primitive'; value: string }
  | { type: 'void' }
  | { type: 'compact'; isBig: boolean; size: string }
  | { type: 'bitSequence'; isLSB: boolean }
  | { type: 'AccountId32' }
  | { type: 'AccountId20' }
  | { type: 'tuple'; value: MetadataVar[]; innerDocs: Array<string[]> }
  | { type: 'struct'; value: Record<string, MetadataVar>; innerDocs: Record<string, string[]> }
  | {
      type: 'enum';
      value: Record<string, MetadataVar & { idx: number }>;
      innerDocs: Record<string, string[]>;
    }
  | { type: 'option'; value: MetadataVar }
  | { type: 'result'; value: { ok: MetadataVar; ko: MetadataVar } }
  | { type: 'sequence'; value: MetadataVar }
  | { type: 'array'; value: MetadataVar; len: number }
  | { type: 'lookupEntry'; value: MetadataVar };

const unwrapVar = (value: MetadataVar): MetadataVar =>
  value.type === 'lookupEntry' ? value.value : value;

const isByteSequence = (value: MetadataVar) => {
  const unwrapped = unwrapVar(value);
  if (unwrapped.type === 'sequence') {
    const inner = unwrapVar(unwrapped.value);
    return inner.type === 'primitive' && inner.value === 'u8';
  }
  if (unwrapped.type === 'array') {
    const inner = unwrapVar(unwrapped.value);
    return inner.type === 'primitive' && inner.value === 'u8';
  }
  return false;
};

const encodeEnumValue = (value: any, def: MetadataVar) => {
  const unwrapped = unwrapVar(def);
  if (unwrapped.type !== 'enum') return value;

  const variantName = typeof value === 'string' ? value : (value?.type ?? value?.tag);
  if (!variantName || !(variantName in unwrapped.value)) {
    return value;
  }

  const variantDef = unwrapVar(unwrapped.value[variantName]);
  if (variantDef.type === 'void') {
    return Enum(variantName);
  }

  const payload =
    value?.value ??
    value?.data ??
    Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => key !== 'type'));

  return Enum(variantName, encodeByVar(payload, variantDef));
};

const encodeByVar = (value: any, def: MetadataVar): any => {
  const unwrapped = unwrapVar(def);

  switch (unwrapped.type) {
    case 'void':
      return undefined;
    case 'primitive':
    case 'compact':
    case 'bitSequence':
    case 'AccountId32':
    case 'AccountId20':
      return value;
    case 'option':
      if (value === null || value === undefined) return undefined;
      return encodeByVar(value, unwrapped.value);
    case 'result':
      return value;
    case 'tuple':
      if (!Array.isArray(value)) return value;
      return value.map((item, index) => encodeByVar(item, unwrapped.value[index]));
    case 'struct': {
      if (value == null || typeof value !== 'object') return value;
      const result: Record<string, unknown> = {};
      Object.entries(unwrapped.value).forEach(([key, fieldDef]) => {
        if (value[key] !== undefined) {
          result[key] = encodeByVar(value[key], fieldDef);
        }
      });
      return result;
    }
    case 'sequence':
      if (isByteSequence(unwrapped)) {
        if (typeof value === 'string') return Binary.fromText(value);
      }
      if (!Array.isArray(value)) return value;
      return value.map((item) => encodeByVar(item, unwrapped.value));
    case 'array':
      if (isByteSequence(unwrapped)) {
        if (typeof value === 'string') return Binary.fromText(value);
      }
      if (!Array.isArray(value)) return value;
      return value.map((item) => encodeByVar(item, unwrapped.value));
    case 'enum':
      return encodeEnumValue(value, unwrapped);
    case 'lookupEntry':
      return encodeByVar(value, unwrapped.value);
    default:
      return value;
  }
};

const getCallArgVar = (
  metadata: UnifiedMetadata,
  palletName: string,
  callName: string,
  argName: string
): MetadataVar => {
  const lookup = getLookupFn(metadata);
  const pallet = metadata.pallets.find((entry) => entry.name === palletName);
  if (!pallet?.calls) {
    throw new Error(`Pallet ${palletName} has no calls metadata`);
  }

  const callsEntry = lookup(pallet.calls.type);
  if (callsEntry.type !== 'enum') {
    throw new Error(`Pallet ${palletName} calls are not an enum`);
  }

  const callVariant = callsEntry.value[callName];
  if (!callVariant) {
    throw new Error(`Call ${palletName}.${callName} not found in metadata`);
  }

  const variantDef = unwrapVar(callVariant);
  if (variantDef.type === 'void') {
    throw new Error(`Call ${palletName}.${callName} has no args`);
  }

  const variantStruct =
    variantDef.type === 'lookupEntry' ? unwrapVar(variantDef.value) : variantDef;

  if (variantStruct.type !== 'struct') {
    throw new Error(`Call ${palletName}.${callName} args are not a struct`);
  }

  const argDef = variantStruct.value[argName];
  if (!argDef) {
    throw new Error(`Call ${palletName}.${callName} missing arg ${argName}`);
  }

  return argDef;
};

export const createCallArgCoercer = async (
  descriptors: { getMetadata: () => Promise<Uint8Array> },
  palletName: string,
  callName: string,
  argName: string
) => {
  const metadata = unifyMetadata(decAnyMetadata(await descriptors.getMetadata()));
  const argVar = getCallArgVar(metadata, palletName, callName, argName);

  return (value: unknown) => encodeByVar(value, argVar);
};
