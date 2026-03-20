import { useState, useEffect, useCallback } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useIsSubmitting } from '../store/txStore';
import { useSettingsStore, PRESET_ENDPOINTS } from '../store/settingsStore';
import { ParticleBackground } from './ParticleBackground';

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
    <div className="min-h-screen min-h-svh bg-surface-dark flex flex-col text-white overflow-hidden relative">
      {/* Atmospheric background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(196, 138, 42, 0.08), transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(184, 92, 74, 0.06), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(91, 143, 170, 0.05), transparent 50%)',
        }}
      />
      <ParticleBackground />

      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-3 lg:p-4">
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm lg:max-w-md">
          {/* Title */}
          <div className="mb-6 lg:mb-10 text-center">
            <h1 className="font-title text-3xl lg:text-5xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 mb-1 lg:mb-2">
              OPEN AUTO BATTLER
            </h1>
            <p className="font-heading text-warm-400 text-xs lg:text-sm tracking-widest uppercase">
              Roguelike Deck-Building Auto-Battler
            </p>
          </div>

          {/* Connection status */}
          <div className="w-full mb-4">
            <div className="p-3 rounded-xl border border-warm-800 bg-warm-900/30">
              <div className="flex items-center gap-2 text-xs lg:text-sm">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnecting
                      ? 'bg-yellow-500 animate-pulse'
                      : isConnected
                        ? 'bg-green-500 animate-pulse'
                        : 'bg-red-500'
                  }`}
                />
                <span className="text-warm-400">
                  {isConnecting ? 'Connecting...' : isConnected ? `Connected to` : 'Disconnected'}
                </span>
                {(isConnected || isConnecting) && (
                  <span className="text-warm-500 font-mono text-[10px] truncate max-w-[180px]">{endpoint}</span>
                )}
                {isConnected && blockNumber !== null && (
                  <span className="text-warm-600 font-mono">
                    #{blockNumber.toLocaleString()}
                  </span>
                )}
                <button
                  onClick={() => setShowNetworkPicker(!showNetworkPicker)}
                  className="ml-auto text-yellow-500 hover:text-yellow-400 text-xs transition-colors shrink-0"
                >
                  {showNetworkPicker ? 'Hide' : 'Configure'}
                </button>
              </div>
              {connectionError && (
                <div className="mt-2 text-[10px] lg:text-xs text-red-300">{connectionError}</div>
              )}
            </div>

            {/* Network picker (collapsed by default) */}
            {showNetworkPicker && (
              <div className="mt-3 flex flex-col gap-2">
                {ENDPOINT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelected(opt.key)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selected === opt.key
                        ? 'border-yellow-500/60 bg-yellow-500/10'
                        : 'border-warm-700 bg-warm-900/30 hover:border-warm-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">{opt.label}</div>
                        <div className="text-warm-500 text-[10px]">{opt.description}</div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selected === opt.key ? 'border-yellow-500' : 'border-warm-600'
                        }`}
                      >
                        {selected === opt.key && (
                          <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        )}
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
                    className="w-full p-3 rounded-xl border border-warm-700 bg-warm-900/50 text-sm font-mono text-white placeholder-warm-600 focus:outline-none focus:border-yellow-500/60"
                  />
                )}

                <button
                  onClick={handleConnect}
                  disabled={!canConnect}
                  className={`w-full p-3 rounded-xl font-bold text-sm transition-all ${
                    canConnect
                      ? 'bg-yellow-500 hover:bg-yellow-400 text-black active:scale-[0.98]'
                      : 'bg-warm-800 text-warm-500 cursor-not-allowed'
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
                  <label className="text-xs font-bold text-warm-500 uppercase ml-1 mb-1 block">
                    Select Account
                  </label>
                  <select
                    value={selectedAccount?.address ?? ''}
                    onChange={(e) =>
                      selectAccount(accounts.find((a) => a.address === e.target.value))
                    }
                    className="w-full bg-warm-900/50 border border-warm-700 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-yellow-500/60"
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
                <div className="p-3 rounded-xl border border-warm-800 bg-warm-900/30">
                  <div className="flex items-center justify-between text-xs lg:text-sm">
                    <span className="text-warm-500">Balance</span>
                    <span
                      className={`font-mono ${
                        checkingBalance
                          ? 'text-warm-600'
                          : hasFunds
                            ? 'text-green-400'
                            : 'text-red-400'
                      }`}
                    >
                      {checkingBalance ? '...' : balance !== null ? formatBalance(balance) : '--'}
                    </span>
                  </div>
                  {!checkingBalance && !hasFunds && balance !== null && (
                    <div className="mt-2 text-[10px] lg:text-xs text-warm-500">
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
                      className="w-full p-4 rounded-xl font-bold text-base bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black active:scale-[0.98] transition-all"
                    >
                      Log In
                    </button>
                  ) : (
                    <button
                      onClick={handleFundAccount}
                      disabled={isSubmitting}
                      className="w-full p-4 rounded-xl font-bold text-base bg-gradient-to-r from-accent-violet to-purple-600 hover:from-purple-500 hover:to-purple-500 text-white active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      Fund Account
                    </button>
                  )}
                </>
              )}

              {/* Divider */}
              {accounts.length > 0 && (
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-warm-800" />
                  <span className="text-warm-600 text-[10px] uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-warm-800" />
                </div>
              )}

              {/* Create account */}
              <button
                onClick={handleCreateAccount}
                disabled={isSubmitting}
                className="w-full p-3 rounded-xl font-bold text-sm border border-warm-700 bg-warm-900/30 hover:border-warm-600 hover:bg-warm-800/50 text-warm-300 transition-all disabled:opacity-50"
              >
                Create Game Account
              </button>
            </div>
          )}

          {/* Version */}
          <div className="mt-6 text-[9px] lg:text-[10px] text-warm-600 font-mono">v0.1.0</div>
        </div>
      </div>
    </div>
  );
}
