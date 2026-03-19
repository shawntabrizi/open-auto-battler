import { create } from 'zustand';

export type TxStatus = 'idle' | 'signing' | 'broadcasting' | 'in-block' | 'finalizing';

interface TxStore {
  status: TxStatus;
  label: string | null;
  isExtensionSigner: boolean;
}

export const useTxStore = create<TxStore>(() => ({
  status: 'idle',
  label: null,
  isExtensionSigner: false,
}));

/** Convenience selector: true when any transaction is in-flight. */
export const useIsSubmitting = () => useTxStore((s) => s.status !== 'idle');
