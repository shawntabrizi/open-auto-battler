import { useTxStore } from '../store/txStore';
import type { TxStatus } from '../store/txStore';

function statusMessage(status: TxStatus, isExtension: boolean): string {
  switch (status) {
    case 'signing':
      return isExtension ? 'Approve in your wallet...' : 'Signing...';
    case 'broadcasting':
      return 'Broadcasting to network...';
    case 'in-block':
      return 'Waiting for confirmation...';
    case 'finalizing':
      return 'Finalizing on chain...';
    default:
      return '';
  }
}

export function TransactionOverlay() {
  const { status, label, isExtensionSigner } = useTxStore();

  if (status === 'idle') return null;

  const message = statusMessage(status, isExtensionSigner);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-warm-900/90 border border-warm-700/50 shadow-2xl max-w-xs text-center">
        {/* Spinner */}
        <div className="w-10 h-10 border-3 border-warm-600 border-t-yellow-400 rounded-full animate-spin" />

        {/* Label (e.g. "Starting Game...") */}
        {label && (
          <p className="text-sm font-heading font-bold text-white tracking-wide uppercase">
            {label}
          </p>
        )}

        {/* Status message */}
        <p className="text-xs text-warm-400">{message}</p>

        {/* Wallet prompt for extension signers */}
        {status === 'signing' && isExtensionSigner && (
          <div className="mt-1 px-3 py-1.5 bg-yellow-900/30 border border-yellow-700/40 rounded-lg">
            <p className="text-[10px] text-yellow-300/80">
              A signing request has been sent to your wallet extension
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
