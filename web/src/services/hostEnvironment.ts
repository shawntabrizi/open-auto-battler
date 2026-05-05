/**
 * Triangle host environment detection.
 * Runs once at module load — before any store initializes.
 */

import { isInsideContainerSync } from '@parity/product-sdk-host';

export const isInHost = (): boolean => HOST_FLAG;

const HOST_FLAG: boolean = isInsideContainerSync();
