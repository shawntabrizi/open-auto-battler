import { useState, useEffect, useCallback } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { TopBar } from './TopBar';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

interface AccountInfo {
  nonce: number;
  free: bigint;
  reserved: bigint;
  frozen: bigint;
}

export function AccountPage() {
  const { isConnected, selectedAccount } = useArenaStore();
  const api = useArenaStore((s) => s.api);

  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const fetchInfo = useCallback(async () => {
    if (!api || !selectedAccount) {
      setInfo(null);
      return;
    }
    setLoading(true);
    try {
      const acct = await api.query.System.Account.getValue(selectedAccount.address);
      setInfo({
        nonce: acct?.nonce ?? 0,
        free: acct?.data?.free ?? BigInt(0),
        reserved: acct?.data?.reserved ?? BigInt(0),
        frozen: acct?.data?.frozen ?? BigInt(0),
      });
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [api, selectedAccount]);

  useEffect(() => {
    void fetchInfo();
  }, [fetchInfo]);

  // Sync name input when account changes
  useEffect(() => {
    setNameInput(selectedAccount?.name ?? '');
    setEditingName(false);
  }, [selectedAccount]);

  const handleSaveName = () => {
    if (!selectedAccount || !nameInput.trim()) return;
    // Update the account name in the store's accounts array
    const { accounts } = useArenaStore.getState();
    const updated = accounts.map((a: any) =>
      a.address === selectedAccount.address ? { ...a, name: nameInput.trim() } : a
    );
    useArenaStore.setState({
      accounts: updated,
      selectedAccount: { ...selectedAccount, name: nameInput.trim() },
    });

    // Persist for local accounts
    if (selectedAccount.source === 'local') {
      try {
        const stored = JSON.parse(localStorage.getItem('oab-local-accounts') || '[]');
        const updatedStored = stored.map((s: any) => {
          // Match by old name since that's the key we have
          if (s.name === selectedAccount.name) {
            return { ...s, name: nameInput.trim() };
          }
          return s;
        });
        localStorage.setItem('oab-local-accounts', JSON.stringify(updatedStored));
      } catch {
        // best effort
      }
    }
    setEditingName(false);
  };

  return (
    <div className="fixed inset-0 bg-warm-950 text-white flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Account" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[10vh]">
          {!isConnected || !selectedAccount ? (
            <div className="text-center py-12 text-warm-500 text-sm">No account connected.</div>
          ) : (
            <div className="flex flex-col gap-4 lg:gap-5">
              {/* Name */}
              <section className="p-4 rounded-xl border border-warm-700 bg-warm-900/30">
                <div className="text-xs text-warm-500 mb-1">Name</div>
                {editingName ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="flex-1 bg-warm-900/50 border border-warm-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500/60"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') {
                          setNameInput(selectedAccount.name ?? '');
                          setEditingName(false);
                        }
                      }}
                    />
                    <button
                      onClick={handleSaveName}
                      className="px-3 py-1.5 text-xs font-bold bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNameInput(selectedAccount.name ?? '');
                        setEditingName(false);
                      }}
                      className="px-3 py-1.5 text-xs text-warm-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm lg:text-base text-white">{selectedAccount.name}</span>
                    <button
                      onClick={() => setEditingName(true)}
                      className="text-xs text-warm-500 hover:text-yellow-500 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </section>

              {/* Address */}
              <section className="p-4 rounded-xl border border-warm-700 bg-warm-900/30">
                <div className="text-xs text-warm-500 mb-1">Address</div>
                <div className="text-xs lg:text-sm font-mono text-warm-300 break-all">
                  {selectedAccount.address}
                </div>
                <div className="text-xs text-warm-500 mt-3 mb-1">Source</div>
                <div className="text-sm text-warm-300 capitalize">{selectedAccount.source}</div>
              </section>

              {/* On-chain info */}
              <section className="p-4 rounded-xl border border-warm-700 bg-warm-900/30">
                <div className="text-xs text-warm-500 mb-3">On-Chain Info</div>

                {loading ? (
                  <div className="text-warm-600 text-sm">Loading...</div>
                ) : info ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-warm-600 uppercase tracking-wider">
                        Nonce
                      </div>
                      <div className="text-sm lg:text-base font-mono text-white">{info.nonce}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-warm-600 uppercase tracking-wider">Free</div>
                      <div className="text-sm lg:text-base font-mono text-green-400">
                        {formatBalance(info.free)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-warm-600 uppercase tracking-wider">
                        Reserved
                      </div>
                      <div className="text-sm lg:text-base font-mono text-yellow-400">
                        {formatBalance(info.reserved)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-warm-600 uppercase tracking-wider">
                        Frozen
                      </div>
                      <div className="text-sm lg:text-base font-mono text-blue-400">
                        {formatBalance(info.frozen)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-warm-600 text-sm">Unable to fetch account info.</div>
                )}

                <button
                  onClick={() => void fetchInfo()}
                  disabled={loading}
                  className="mt-3 text-xs text-warm-500 hover:text-yellow-500 transition-colors disabled:opacity-50"
                >
                  Refresh
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
