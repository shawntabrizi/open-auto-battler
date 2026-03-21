import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const fundSelectedAccount = useArenaStore((s) => s.fundSelectedAccount);
  const logout = useArenaStore((s) => s.logout);
  const navigate = useNavigate();

  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isFunding, setIsFunding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showForgetConfirm, setShowForgetConfirm] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const removeLocalAccount = useArenaStore((s) => s.removeLocalAccount);
  const getLocalAccountMnemonic = useArenaStore((s) => s.getLocalAccountMnemonic);

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
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Account" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-md lg:max-w-lg mx-auto p-3 lg:p-4 lg:mt-[10vh]">
          {!isConnected || !selectedAccount ? (
            <div className="theme-panel border border-warm-700 bg-warm-900/30 p-6 text-center text-sm text-warm-500">
              No account connected.
            </div>
          ) : (
            <div className="flex flex-col gap-4 lg:gap-5">
              {/* Name */}
              <section className="theme-panel p-4 rounded-xl border border-warm-700 bg-warm-900/30">
                <div className="text-xs text-warm-500 mb-1">Name</div>
                {editingName ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="theme-input flex-1 bg-warm-900/50 border border-warm-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gold/60"
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
                      className="theme-button btn-primary px-3 py-1.5 text-xs font-bold rounded-lg transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNameInput(selectedAccount.name ?? '');
                        setEditingName(false);
                      }}
                      className="theme-button theme-surface-button px-3 py-1.5 text-xs rounded-lg border transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm lg:text-base text-white">{selectedAccount.name}</span>
                    <button
                      onClick={() => setEditingName(true)}
                      className="text-xs text-warm-500 hover:text-gold transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </section>

              {/* Address */}
              <section className="theme-panel p-4 rounded-xl border border-warm-700 bg-warm-900/30">
                <div className="text-xs text-warm-500 mb-1">Address</div>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(selectedAccount.address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="text-xs lg:text-sm font-mono text-warm-300 break-all text-left hover:text-white transition-colors w-full"
                  title="Click to copy"
                >
                  <span className="block">{selectedAccount.address}</span>
                  <span className="mt-1 block text-[10px] text-warm-500">
                    {copied ? 'Copied!' : 'Tap to copy'}
                  </span>
                </button>
                <div className="text-xs text-warm-500 mt-3 mb-1">Source</div>
                <div className="text-sm text-warm-300 capitalize">{selectedAccount.source}</div>
              </section>

              {/* Export mnemonic — local accounts only */}
              {selectedAccount.source === 'local' && (
                <section className="theme-panel p-4 rounded-xl border border-warm-700 bg-warm-900/30">
                  <div className="text-xs text-warm-500 mb-2">Secret Recovery Phrase</div>
                  {showMnemonic ? (
                    <>
                      <div className="theme-panel bg-warm-950 border border-warm-700 rounded-lg p-3 font-mono text-xs lg:text-sm text-gold break-all select-all">
                        {getLocalAccountMnemonic(selectedAccount.address) || 'Not found'}
                      </div>
                      <p className="text-[10px] text-defeat-red/80 mt-2">
                        Do not share this with anyone. Anyone with this phrase can access your
                        account.
                      </p>
                      <button
                        onClick={() => setShowMnemonic(false)}
                        className="text-xs text-warm-500 hover:text-warm-300 mt-2 transition-colors"
                      >
                        Hide
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowMnemonic(true)}
                      className="theme-button theme-surface-button px-4 py-2 rounded-lg border transition-colors text-xs lg:text-sm font-semibold"
                    >
                      Reveal Recovery Phrase
                    </button>
                  )}
                </section>
              )}

              {/* On-chain info */}
              <section className="theme-panel p-4 rounded-xl border border-warm-700 bg-warm-900/30">
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
                      <div className="text-sm lg:text-base font-mono text-accent-emerald">
                        {formatBalance(info.free)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-warm-600 uppercase tracking-wider">
                        Reserved
                      </div>
                      <div className="text-sm lg:text-base font-mono text-gold">
                        {formatBalance(info.reserved)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-warm-600 uppercase tracking-wider">
                        Frozen
                      </div>
                      <div className="text-sm lg:text-base font-mono text-mana-blue">
                        {formatBalance(info.frozen)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-warm-600 text-sm">Unable to fetch account info.</div>
                )}

                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={() => void fetchInfo()}
                    disabled={loading}
                    className="theme-button theme-surface-button px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={async () => {
                      setIsFunding(true);
                      try {
                        await fundSelectedAccount();
                        await fetchInfo();
                      } finally {
                        setIsFunding(false);
                      }
                    }}
                    disabled={isFunding}
                    className="theme-button btn-primary px-4 py-1.5 rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    {isFunding ? 'Funding...' : 'Fund Account'}
                  </button>
                </div>
              </section>

              {/* Logout */}
              <button
                onClick={() => {
                  logout();
                  void navigate('/');
                }}
                className="theme-button theme-danger-button w-full p-3 rounded-xl border transition-colors text-sm font-semibold"
              >
                Log Out
              </button>

              {/* Forget Account — local accounts only */}
              {selectedAccount.source === 'local' &&
                (showForgetConfirm ? (
                  <div className="theme-panel theme-error-panel w-full p-4 rounded-xl border">
                    <p className="text-sm text-warm-300 mb-3 text-center">
                      Forget this account? The private key will be permanently deleted.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowForgetConfirm(false)}
                        className="theme-button theme-surface-button flex-1 p-2.5 rounded-lg border text-sm font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          removeLocalAccount(selectedAccount.address);
                          logout();
                          void navigate('/');
                        }}
                        className="theme-button theme-danger-solid flex-1 p-2.5 rounded-lg border text-sm font-semibold transition-colors"
                      >
                        Forget
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowForgetConfirm(true)}
                    className="theme-button theme-danger-button w-full p-3 rounded-xl border transition-colors text-sm opacity-70 hover:opacity-100"
                  >
                    Forget Account
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
