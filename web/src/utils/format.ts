/**
 * Format a raw planck balance for display with locale formatting.
 *
 * When @polkadot-apps/utils is published to npm, this can be replaced with:
 *   import { formatPlanck } from '@polkadot-apps/utils';
 */
export const formatBalance = (raw: bigint, decimals = 12): string => {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const fractionStr = remainder.toString().padStart(decimals, '0');
  const trimmed = fractionStr.replace(/0+$/, '') || '0';
  const decimal = Number(`${whole}.${trimmed}`);

  return decimal.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
};
