import { toast } from 'react-hot-toast';
import { useArenaStore } from '../store/arenaStore';
import { useTxStore } from '../store/txStore';
import { getErrorMessage, isRecord } from './safe';

const TX_TIMEOUT_MS = 30_000; // 30 seconds

interface ChainEventValue {
  type?: string;
  value?: unknown;
}

interface ChainEventRecord {
  type: string;
  value?: ChainEventValue;
}

type TxWatchEvent =
  | { type: 'signed'; txHash: string }
  | { type: 'broadcasted' }
  | { type: 'txBestBlocksState'; found?: boolean }
  | {
      type: 'finalized';
      ok: boolean;
      dispatchError?: unknown;
      events?: ChainEventRecord[];
      block: unknown;
    }
  | { type: string };

interface WatchableTx {
  signSubmitAndWatch: (signer: unknown) => {
    subscribe: (observer: {
      next: (event: TxWatchEvent) => void;
      error: (err: unknown) => void;
    }) => void;
  };
}

export interface SubmitTxResult {
  events: ChainEventRecord[] | undefined;
  block: unknown;
}

function toError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error, fallback));
}

function extractFailedDispatchError(event: ChainEventRecord): unknown {
  const payload = event.value?.value;
  if (isRecord(payload) && 'dispatch_error' in payload) {
    return payload.dispatch_error;
  }
  return payload;
}

function isSignedEvent(event: TxWatchEvent): event is Extract<TxWatchEvent, { type: 'signed' }> {
  return event.type === 'signed' && 'txHash' in event;
}

function isBestBlockStateEvent(
  event: TxWatchEvent
): event is Extract<TxWatchEvent, { type: 'txBestBlocksState' }> {
  return event.type === 'txBestBlocksState' && 'found' in event;
}

function isFinalizedEvent(
  event: TxWatchEvent
): event is Extract<TxWatchEvent, { type: 'finalized' }> {
  return event.type === 'finalized' && 'ok' in event;
}

/**
 * Submit a PAPI transaction with lifecycle tracking and full error handling.
 *
 * Uses `signSubmitAndWatch` to emit granular progress states into txStore:
 *   signing -> broadcasting -> in-block -> finalizing -> idle
 *
 * All existing callers continue to receive a Promise that resolves on finalization.
 */
export function submitTx(tx: WatchableTx, signer: unknown, label: string): Promise<SubmitTxResult> {
  console.log(`[tx] Submitting: ${label}`);

  const account = useArenaStore.getState().selectedAccount;
  const isExtension = account?.source !== 'local' && account?.source !== 'dev';

  useTxStore.setState({ status: 'signing', label, isExtensionSigner: isExtension });

  return new Promise<SubmitTxResult>((resolve, reject) => {
    let settled = false;

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
        next(event) {
          if (settled) return;

          switch (event.type) {
            case 'signed':
              if (isSignedEvent(event)) {
                console.log(`[tx] Signed: ${label} (${event.txHash})`);
                useTxStore.setState({ status: 'broadcasting' });
              }
              break;
            case 'broadcasted':
              console.log(`[tx] Broadcasted: ${label}`);
              useTxStore.setState({ status: 'in-block' });
              break;
            case 'txBestBlocksState':
              if (isBestBlockStateEvent(event) && event.found) {
                console.log(`[tx] In best block: ${label}`);
                useTxStore.setState({ status: 'finalizing' });
              }
              break;
            case 'finalized': {
              if (!isFinalizedEvent(event)) {
                break;
              }
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

              const failedEvent = event.events?.find(
                (chainEvent: ChainEventRecord) =>
                  chainEvent.type === 'System' && chainEvent.value?.type === 'ExtrinsicFailed'
              );
              if (failedEvent) {
                const msg = formatDispatchError(extractFailedDispatchError(failedEvent));
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
        error(err) {
          if (settled) return;
          settled = true;
          cleanup();

          const dispatchError = isRecord(err) ? err.dispatchError : undefined;
          console.error(`[tx] Failed: ${label}`, getErrorMessage(err, 'Unknown error'));
          if (dispatchError) {
            console.error(`[tx] Dispatch error:`, JSON.stringify(dispatchError, null, 2));
          }

          const msg = extractErrorMessage(err, label);
          toast.error(msg);
          reject(toError(err, msg));
        },
      });
    } catch (err) {
      settled = true;
      cleanup();
      console.error(`[tx] Failed to start: ${label}`, getErrorMessage(err, 'Unknown error'));
      const msg = extractErrorMessage(err, label);
      toast.error(msg);
      reject(toError(err, msg));
    }
  });
}

function formatDispatchError(dispatchError: unknown): string {
  if (!dispatchError) return 'Unknown dispatch error';
  if (typeof dispatchError === 'string') return dispatchError;

  if (isRecord(dispatchError)) {
    const moduleError = dispatchError.Module ?? dispatchError.value;
    if (isRecord(moduleError) && 'index' in moduleError && 'error' in moduleError) {
      const index = String(moduleError.index);
      const rawError = moduleError.error;
      const errorCode =
        typeof rawError === 'string' ? rawError : Number(rawError).toString(16).padStart(8, '0');
      return `Module error (pallet ${index}, error 0x${errorCode})`;
    }

    if (typeof dispatchError.type === 'string') {
      return `${dispatchError.type}: ${JSON.stringify(dispatchError.value)}`;
    }
  }

  try {
    return JSON.stringify(dispatchError);
  } catch {
    return 'Unknown dispatch error';
  }
}

function extractErrorMessage(err: unknown, label: string): string {
  if (isRecord(err) && 'dispatchError' in err) {
    return `${label}: ${formatDispatchError(err.dispatchError)}`;
  }

  const message = getErrorMessage(err);
  if (message.includes('ExtrinsicFailed') || message.includes('Module')) {
    return `${label}: ${message}`;
  }

  return `${label} failed: ${message}`;
}
