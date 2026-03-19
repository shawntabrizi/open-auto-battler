import { toast } from 'react-hot-toast';
import { useTxStore } from '../store/txStore';
import { useBlockchainStore } from '../store/blockchainStore';

const TX_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Submit a PAPI transaction with lifecycle tracking and full error handling.
 *
 * Uses `signSubmitAndWatch` to emit granular progress states into txStore:
 *   signing → broadcasting → in-block → finalizing → idle
 *
 * All existing callers continue to receive a Promise that resolves on finalization.
 */
export function submitTx(
  tx: any,
  signer: any,
  label: string,
): Promise<any> {
  console.log(`[tx] Submitting: ${label}`);

  const account = useBlockchainStore.getState().selectedAccount;
  const isExtension = account?.source !== 'local' && account?.source !== 'dev';

  useTxStore.setState({ status: 'signing', label, isExtensionSigner: isExtension });

  return new Promise<any>((resolve, reject) => {
    let settled = false;

    // Timeout guard
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        useTxStore.setState({ status: 'idle', label: null, isExtensionSigner: false });
        const err = new Error(`Transaction timed out after ${TX_TIMEOUT_MS / 1000}s`);
        toast.error(`${label}: timed out`);
        reject(err);
      }
    }, TX_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      useTxStore.setState({ status: 'idle', label: null, isExtensionSigner: false });
    };

    try {
      tx.signSubmitAndWatch(signer).subscribe({
        next(event: any) {
          if (settled) return;

          switch (event.type) {
            case 'signed':
              console.log(`[tx] Signed: ${label} (${event.txHash})`);
              useTxStore.setState({ status: 'broadcasting' });
              break;
            case 'broadcasted':
              console.log(`[tx] Broadcasted: ${label}`);
              useTxStore.setState({ status: 'in-block' });
              break;
            case 'txBestBlocksState':
              if (event.found) {
                console.log(`[tx] In best block: ${label}`);
                useTxStore.setState({ status: 'finalizing' });
              }
              break;
            case 'finalized': {
              settled = true;
              cleanup();
              console.log(`[tx] Finalized: ${label} (ok=${event.ok})`);

              if (!event.ok) {
                const msg = formatDispatchError(event.dispatchError);
                console.error(`[tx] Dispatch error in ${label}:`, msg);
                toast.error(`${label}: ${msg}`);
                reject(new Error(`${label}: ${msg}`));
                return;
              }

              // Check for ExtrinsicFailed event even when ok=true
              // (belt-and-suspenders for edge cases)
              const failedEvent = event.events?.find(
                (e: any) => e.type === 'System' && e.value?.type === 'ExtrinsicFailed'
              );
              if (failedEvent) {
                const dispatchError = failedEvent.value?.value?.dispatch_error ?? failedEvent.value?.value;
                const msg = formatDispatchError(dispatchError);
                console.error(`[tx] Dispatch error in ${label}:`, msg);
                toast.error(`${label}: ${msg}`);
                reject(new Error(`${label}: ${msg}`));
                return;
              }

              resolve({ events: event.events, block: event.block });
              break;
            }
          }
        },
        error(err: any) {
          if (settled) return;
          settled = true;
          cleanup();

          console.error(`[tx] Failed: ${label}`, err?.message);
          if (err?.dispatchError) {
            console.error(`[tx] Dispatch error:`, JSON.stringify(err.dispatchError, null, 2));
          }

          const msg = extractErrorMessage(err, label);
          toast.error(msg);
          reject(err);
        },
      });
    } catch (err: any) {
      // signSubmitAndWatch itself threw (e.g. signer unavailable)
      settled = true;
      cleanup();
      console.error(`[tx] Failed to start: ${label}`, err?.message);
      const msg = extractErrorMessage(err, label);
      toast.error(msg);
      reject(err);
    }
  });
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
