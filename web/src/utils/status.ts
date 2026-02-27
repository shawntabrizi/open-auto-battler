import type { Status, StatusMask } from '../types';

const STATUS_BITS: Record<Status, number> = {
  Shield: 0,
  Poison: 1,
  Guard: 2,
};

export const STATUS_ORDER: Status[] = ['Shield', 'Poison', 'Guard'];

export const STATUS_ICON: Record<Status, string> = {
  Shield: '🛡',
  Poison: '☠',
  Guard: '🎯',
};

export function emptyStatusMask(): StatusMask {
  return new Array(32).fill(0);
}

export function normalizeStatusMask(mask: number[] | null | undefined): StatusMask {
  const out = emptyStatusMask();
  if (!Array.isArray(mask)) return out;
  const limit = Math.min(mask.length, out.length);
  for (let i = 0; i < limit; i++) {
    out[i] = Number(mask[i]) & 0xff;
  }
  return out;
}

export function decodeStatusMask(value: any): StatusMask {
  if (Array.isArray(value)) {
    return normalizeStatusMask(value);
  }
  if (typeof value === 'number') {
    const out = emptyStatusMask();
    out[0] = value & 0xff;
    out[1] = (value >> 8) & 0xff;
    return out;
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.value)) {
      return normalizeStatusMask(value.value);
    }
    if (Array.isArray(value.asBytes)) {
      return normalizeStatusMask(value.asBytes);
    }
  }
  return emptyStatusMask();
}

export function hasStatus(mask: StatusMask | null | undefined, status: Status): boolean {
  const normalized = normalizeStatusMask(mask ?? undefined);
  const bit = STATUS_BITS[status];
  const byteIndex = bit >> 3;
  const bitMask = 1 << (bit & 7);
  return (normalized[byteIndex] & bitMask) !== 0;
}

export function setStatus(
  mask: StatusMask | null | undefined,
  status: Status,
  enabled: boolean
): StatusMask {
  const next = normalizeStatusMask(mask ?? undefined);
  const bit = STATUS_BITS[status];
  const byteIndex = bit >> 3;
  const bitMask = 1 << (bit & 7);
  next[byteIndex] = enabled ? next[byteIndex] | bitMask : next[byteIndex] & ~bitMask;
  return next;
}

export function toggleStatus(mask: StatusMask | null | undefined, status: Status): StatusMask {
  return setStatus(mask, status, !hasStatus(mask, status));
}

export function statusesFromMask(mask: StatusMask | null | undefined): Status[] {
  return STATUS_ORDER.filter((status) => hasStatus(mask, status));
}
