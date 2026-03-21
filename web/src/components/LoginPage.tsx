import { useState, useEffect, useCallback } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useIsSubmitting } from '../store/txStore';
import { useSettingsStore, PRESET_ENDPOINTS } from '../store/settingsStore';

import { useInitGuard } from '../hooks';
import toast from 'react-hot-toast';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

type EndpointOption = 'local' | 'hosted' | 'custom';

function getOptionFromEndpoint(endpoint: string): EndpointOption {
  if (endpoint === PRESET_ENDPOINTS.local) return 'local';
  if (endpoint === PRESET_ENDPOINTS.hosted) return 'hosted';
  return 'custom';
}

const ENDPOINT_OPTIONS: {
  key: EndpointOption;
  label: string;
  description: string;
  url?: string;
}[] = [
  {
    key: 'local',
    label: 'Localhost',
    description: 'Local dev node',
    url: PRESET_ENDPOINTS.local,
  },
  {
    key: 'hosted',
    label: 'Hosted Node',
    description: 'Remote server',
    url: PRESET_ENDPOINTS.hosted,
  },
  { key: 'custom', label: 'Custom', description: 'WebSocket URL' },
];

export function LoginPage() {
  const {
    isConnected,
    isConnecting,
    connect,
    accounts,
    selectedAccount,
    selectAccount,
    createLocalAccount,
    fundSelectedAccount,
    getAccountBalance,
    login,
    blockNumber,
    connectionError,
  } = useArenaStore();

  const { endpoint, setEndpoint } = useSettingsStore();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const isSubmitting = useIsSubmitting();
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [selected, setSelected] = useState<EndpointOption>(getOptionFromEndpoint(endpoint));
  const [customUrl, setCustomUrl] = useState(
    getOptionFromEndpoint(endpoint) === 'custom' ? endpoint : ''
  );

  // Auto-connect on mount
  useInitGuard(() => {
    if (!isConnected) {
      void connect();
    }
  }, [connect, isConnected]);

  // Fetch balance when selected account changes
  const fetchBalance = useCallback(async () => {
    if (!selectedAccount || !isConnected) {
      setBalance(null);
      return;
    }
    setCheckingBalance(true);
    try {
      const bal = await getAccountBalance(selectedAccount.address);
      setBalance(bal);
    } finally {
      setCheckingBalance(false);
    }
  }, [selectedAccount, isConnected, getAccountBalance]);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const hasFunds = balance !== null && balance > BigInt(0);

  const handleLogin = () => {
    if (!selectedAccount || !hasFunds) return;
    login();
  };

  const handleCreateAccount = async () => {
    const name = `Account ${accounts.length + 1}`;
    await createLocalAccount(name);
  };

  const handleFundAccount = async () => {
    if (!selectedAccount) return;
    try {
      await fundSelectedAccount();
      toast.success('Account funded');
      await fetchBalance();
    } catch {
      toast.error('Failed to fund account');
    }
  };

  const resolvedUrl =
    selected === 'local'
      ? PRESET_ENDPOINTS.local
      : selected === 'hosted'
        ? PRESET_ENDPOINTS.hosted
        : customUrl;

  const canConnect = resolvedUrl && (selected !== 'custom' || customUrl.startsWith('ws'));

  const handleConnect = async () => {
    if (!canConnect) return;
    setEndpoint(resolvedUrl);
    const connected = await connect();
    if (connected) {
      toast.success('Connected');
      setShowNetworkPicker(false);
    } else {
      toast.error('Failed to connect');
    }
  };

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white overflow-hidden relative">
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-3 lg:p-4">
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm lg:max-w-md">
          {/* Title */}
          <div className="mb-6 lg:mb-10 text-center">
            <h1 className="theme-title-text font-decorative text-3xl lg:text-5xl font-bold tracking-wide text-transparent bg-clip-text mb-1 lg:mb-2">
              OPEN AUTO BATTLER
            </h1>
            <p className="theme-hero-subtitle font-heading text-xs lg:text-sm tracking-widest uppercase">
              Roguelike Deck-Building Auto-Battler
            </p>
          </div>

          {/* Connection status */}
          <div className="w-full mb-4">
            <div className="theme-panel p-3 rounded-xl border border-base-800 bg-base-900/30">
              <div className="flex items-center gap-2 text-xs lg:text-sm">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnecting
                      ? 'bg-accent animate-pulse'
                      : isConnected
                        ? 'bg-positive animate-pulse'
                        : 'bg-defeat'
                  }`}
                />
                <span className="text-base-400">
                  {isConnecting ? 'Connecting...' : isConnected ? `Connected to` : 'Disconnected'}
                </span>
                {(isConnected || isConnecting) && (
                  <span className="text-base-500 font-mono text-[10px] truncate max-w-[180px]">
                    {endpoint}
                  </span>
                )}
                {isConnected && blockNumber !== null && (
                  <span className="text-base-600 font-mono">#{blockNumber.toLocaleString()}</span>
                )}
                <button
                  onClick={() => setShowNetworkPicker(!showNetworkPicker)}
                  className="ml-auto text-accent hover:text-base-200 text-xs transition-colors shrink-0"
                >
                  {showNetworkPicker ? 'Hide' : 'Configure'}
                </button>
              </div>
              {connectionError && (
                <div className="mt-2 text-[10px] lg:text-xs text-defeat">{connectionError}</div>
              )}
            </div>

            {/* Network picker (collapsed by default) */}
            {showNetworkPicker && (
              <div className="mt-3 flex flex-col gap-2">
                {ENDPOINT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelected(opt.key)}
                    className={`theme-panel w-full text-left p-3 rounded-xl border transition-all ${
                      selected === opt.key
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-base-700 bg-base-900/30 hover:border-base-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">{opt.label}</div>
                        <div className="text-base-500 text-[10px]">{opt.description}</div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selected === opt.key ? 'border-accent' : 'border-base-600'
                        }`}
                      >
                        {selected === opt.key && <div className="w-2 h-2 rounded-full bg-accent" />}
                      </div>
                    </div>
                  </button>
                ))}

                {selected === 'custom' && (
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="ws://..."
                    className="theme-input w-full p-3 rounded-xl border border-base-700 bg-base-900/50 text-sm font-mono text-white placeholder-base-600 focus:outline-none focus:border-accent/60"
                  />
                )}

                <button
                  onClick={handleConnect}
                  disabled={!canConnect}
                  className={`w-full p-3 rounded-xl font-bold text-sm transition-all ${
                    canConnect
                      ? 'theme-button btn-primary active:scale-[0.98]'
                      : 'bg-base-800 text-base-500 cursor-not-allowed'
                  }`}
                >
                  Connect
                </button>
              </div>
            )}
          </div>

          {/* Account selection — only when connected */}
          {isConnected && (
            <div className="w-full flex flex-col gap-3">
              {/* Account selector */}
              {accounts.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-base-500 uppercase ml-1 mb-1 block">
                    Select Account
                  </label>
                  <select
                    value={selectedAccount?.address ?? ''}
                    onChange={(e) =>
                      selectAccount(accounts.find((a) => a.address === e.target.value))
                    }
                    className="theme-input w-full bg-base-900/50 border border-base-700 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-accent/60"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.address} value={acc.address}>
                        {acc.source === 'dev' ? '[dev] ' : acc.source === 'local' ? '[local] ' : ''}
                        {acc.name} ({acc.address.slice(0, 6)}...{acc.address.slice(-4)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Balance display */}
              {selectedAccount && (
                <div className="theme-panel p-3 rounded-xl border border-base-800 bg-base-900/30">
                  <div className="flex items-center justify-between text-xs lg:text-sm">
                    <span className="text-base-500">Balance</span>
                    <span
                      className={`font-mono ${
                        checkingBalance
                          ? 'text-base-600'
                          : hasFunds
                            ? 'text-positive'
                            : 'text-defeat'
                      }`}
                    >
                      {checkingBalance ? '...' : balance !== null ? formatBalance(balance) : '--'}
                    </span>
                  </div>
                  {!checkingBalance && !hasFunds && balance !== null && (
                    <div className="mt-2 text-[10px] lg:text-xs text-base-500">
                      This account has no funds. Fund it to log in.
                    </div>
                  )}
                </div>
              )}

              {/* Login / Fund button */}
              {selectedAccount && !checkingBalance && (
                <>
                  {hasFunds ? (
                    <button
                      onClick={handleLogin}
                      className="theme-button btn-primary w-full p-4 rounded-xl font-bold text-base active:scale-[0.98] transition-all"
                    >
                      Log In
                    </button>
                  ) : (
                    <button
                      onClick={handleFundAccount}
                      disabled={isSubmitting}
                      className="theme-button btn-primary w-full p-4 rounded-xl font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      Fund Account
                    </button>
                  )}
                </>
              )}

              {/* Divider */}
              {accounts.length > 0 && (
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-base-800" />
                  <span className="text-base-600 text-[10px] uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-base-800" />
                </div>
              )}

              {/* Create account */}
              <button
                onClick={handleCreateAccount}
                disabled={isSubmitting}
                className="theme-button theme-surface-button w-full p-3 rounded-xl font-bold text-sm border transition-all disabled:opacity-50"
              >
                Create Game Account
              </button>
            </div>
          )}

          {/* Version */}
          <div className="mt-6 text-[9px] lg:text-[10px] text-base-600 font-mono">v0.1.0</div>
        </div>
      </div>
    </div>
  );
}
