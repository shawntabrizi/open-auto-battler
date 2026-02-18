import { toast } from 'react-hot-toast';

/**
 * Submit a PAPI transaction with full error logging.
 * Logs the complete error object on failure and shows a toast.
 * Returns the tx result on success, throws on failure.
 */
export async function submitTx(
  tx: any,
  signer: any,
  label: string,
): Promise<any> {
  console.log(`[tx] Submitting: ${label}`);
  try {
    const result = await tx.signAndSubmit(signer);
    console.log(`[tx] Success: ${label}`, result);

    // Check for ExtrinsicFailed event even on "success"
    // (some PAPI versions resolve instead of rejecting)
    const failedEvent = result?.events?.find(
      (e: any) => e.type === 'System' && e.value?.type === 'ExtrinsicFailed'
    );
    if (failedEvent) {
      const dispatchError = failedEvent.value?.value?.dispatch_error ?? failedEvent.value?.value;
      console.error(`[tx] Dispatch error in ${label}:`, JSON.stringify(dispatchError, null, 2));
      console.error(`[tx] Full failed event:`, failedEvent);
      const msg = formatDispatchError(dispatchError);
      toast.error(`${label}: ${msg}`);
      throw new Error(`${label}: ${msg}`);
    }

    return result;
  } catch (err: any) {
    console.error(`[tx] Failed: ${label}`);
    console.error(`[tx] Error type:`, err?.constructor?.name);
    console.error(`[tx] Error message:`, err?.message);
    console.error(`[tx] Full error:`, err);

    // PAPI TransactionError has various shapes
    if (err?.dispatchError) {
      console.error(`[tx] Dispatch error:`, JSON.stringify(err.dispatchError, null, 2));
    }
    if (err?.events) {
      console.error(`[tx] Events:`, err.events);
    }
    // Log all enumerable properties
    for (const key of Object.keys(err || {})) {
      console.error(`[tx] err.${key}:`, err[key]);
    }

    const msg = extractErrorMessage(err, label);
    toast.error(msg);
    throw err;
  }
}

function formatDispatchError(dispatchError: any): string {
  if (!dispatchError) return 'Unknown dispatch error';

  // Module error: { Module: { index, error } } or { type: 'Module', value: { index, error } }
  const mod = dispatchError?.Module ?? dispatchError?.value;
  if (mod?.index !== undefined && mod?.error !== undefined) {
    return `Module error (pallet ${mod.index}, error 0x${typeof mod.error === 'string' ? mod.error : mod.error.toString(16).padStart(8, '0')})`;
  }

  if (typeof dispatchError === 'string') return dispatchError;
  if (dispatchError?.type) return `${dispatchError.type}: ${JSON.stringify(dispatchError.value)}`;
  return JSON.stringify(dispatchError);
}

function extractErrorMessage(err: any, label: string): string {
  if (err?.dispatchError) {
    return `${label}: ${formatDispatchError(err.dispatchError)}`;
  }
  if (err?.message?.includes('ExtrinsicFailed') || err?.message?.includes('Module')) {
    return `${label}: ${err.message}`;
  }
  return `${label} failed: ${err?.message || 'Unknown error'}`;
}
