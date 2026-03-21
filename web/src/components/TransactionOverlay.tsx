import { useTxStore } from '../store/txStore';
import type { TxStatus } from '../store/txStore';
import { UI_LAYERS } from '../constants/uiLayers';

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
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      style={{ zIndex: UI_LAYERS.transaction }}
    >
      <div className="theme-panel flex flex-col items-center gap-4 p-8 rounded-2xl bg-surface-dark/90 border border-base-700/50 shadow-2xl max-w-xs text-center">
        {/* Spinner */}
        <div className="w-12 h-12 border-[3px] border-base-600 border-t-accent rounded-full animate-spin" />

        {/* Label (e.g. "Starting Game...") */}
        {label && (
          <p className="text-sm font-heading font-bold text-white tracking-wide uppercase">
            {label}
          </p>
        )}

        {/* Status message */}
        <p className="text-xs text-base-400">{message}</p>

        {/* Wallet prompt for extension signers */}
        {status === 'signing' && isExtensionSigner && (
          <div className="theme-panel mt-1 px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-lg">
            <p className="text-[10px] text-accent/80">
              A signing request has been sent to your wallet extension
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
