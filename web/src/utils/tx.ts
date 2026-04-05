import { toast } from 'react-hot-toast';
import { useTxStore, type TxStatus as OabTxStatus } from '../store/txStore';
import { useArenaStore } from '../store/arenaStore';
import { submitAndWatch, TxDispatchError, TxTimeoutError, TxSigningRejectedError } from '@polkadot-apps/tx';
import type { TxStatus } from '@polkadot-apps/tx';

const TX_TIMEOUT_MS = 30_000; // 30 seconds

/** Map library status to OAB's txStore status. */
function mapStatus(status: TxStatus): OabTxStatus | null {
  switch (status) {
    case 'signing': return 'signing';
    case 'broadcasting': return 'broadcasting';
    case 'in-block': return 'in-block';
    default: return null;
  }
}

/**
 * Submit a PAPI transaction with lifecycle tracking and full error handling.
 *
 * Uses @polkadot-apps/tx submitAndWatch under the hood, with OAB-specific
 * UI integration (txStore status updates + react-hot-toast notifications).
 */
export function submitTx(
  tx: any,
  signer: any,
  label: string,
): Promise<any> {
  console.log(`[tx] Submitting: ${label}`);

  const account = useArenaStore.getState().selectedAccount;
  const isExtension = account?.source !== 'local' && account?.source !== 'dev';

  useTxStore.setState({ status: 'signing', label, isExtensionSigner: isExtension });

  const cleanup = () => {
    useTxStore.setState({ status: 'idle', label: null, isExtensionSigner: false });
  };

  return submitAndWatch(tx, signer, {
    waitFor: 'finalized',
    timeoutMs: TX_TIMEOUT_MS,
    onStatus: (status: TxStatus) => {
      const mapped = mapStatus(status);
      if (mapped) {
        useTxStore.setState({ status: mapped });
      }
    },
  })
    .then((result) => {
      cleanup();
      console.log(`[tx] Finalized: ${label} (ok=${result.ok})`);
      return { events: result.events, block: result.block };
    })
    .catch((err) => {
      cleanup();

      if (err instanceof TxTimeoutError) {
        console.error(`[tx] Timed out: ${label}`);
        toast.error(`${label}: timed out`);
      } else if (err instanceof TxDispatchError) {
        console.error(`[tx] Dispatch error in ${label}:`, err.message);
        toast.error(`${label}: ${err.message}`);
      } else if (err instanceof TxSigningRejectedError) {
        console.error(`[tx] Signing rejected: ${label}`);
        toast.error(`${label}: signing rejected`);
      } else {
        console.error(`[tx] Failed: ${label}`, err?.message);
        toast.error(`${label} failed: ${err?.message || 'Unknown error'}`);
      }

      throw err;
    });
}
