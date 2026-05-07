import { useContractStore } from '../store/contractStore';
import { TopBar } from './TopBar';
import { Link } from 'react-router-dom';
import { useState } from 'react';

/** Contract mode main menu — connect signer, select account, and choose game mode. */
export function ContractMenuPage() {
  const {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    connectionError,
    wsUrl,
    setConfig,
    accounts,
    selectedAccount,
    selectAccount,
  } = useContractStore();
  const [editWs, setEditWs] = useState(wsUrl);

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/" backLabel="Home" title="Smart Contract" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 gap-6">
        <h1 className="theme-title-text text-2xl lg:text-4xl font-black italic tracking-tighter text-transparent bg-clip-text">
          CONTRACT MODE
        </h1>
        <p className="text-base-400 text-sm max-w-md text-center">
          Play on a PolkaVM smart contract on Polkadot Asset Hub. Connects via the Polkadot host
          when running inside one, otherwise uses dev accounts (Alice, Bob…).
        </p>

        {!isConnected ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <div className="w-full">
              <label className="block text-xs text-base-500 mb-1">Asset Hub WS Endpoint</label>
              <input
                type="text"
                value={editWs}
                onChange={(e) => setEditWs(e.target.value)}
                className="w-full bg-base-900 border border-base-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setConfig(editWs);
                  void connect(true);
                }}
                disabled={isConnecting}
                className="theme-button btn-primary flex-1 font-bold py-3 rounded-xl text-sm transition-all transform hover:scale-105 disabled:opacity-50"
              >
                {isConnecting ? 'CONNECTING...' : 'DEV ACCOUNTS'}
              </button>
              <button
                onClick={() => {
                  setConfig(editWs);
                  void connect(false);
                }}
                disabled={isConnecting}
                className="theme-button btn-secondary flex-1 font-bold py-3 rounded-xl text-sm transition-all transform hover:scale-105 disabled:opacity-50"
              >
                HOST
              </button>
            </div>
            {connectionError && (
              <p className="max-w-md rounded-xl theme-error-panel border px-3 py-2 text-center text-xs text-negative">
                {connectionError}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            {/* Account selector */}
            <div className="w-full">
              <label className="block text-xs text-base-500 mb-2">Account</label>
              <div className="flex flex-col gap-2">
                {accounts.map((account) => {
                  const isSelected = selectedAccount?.address === account.address;
                  const addr = account.address;
                  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                  return (
                    <button
                      key={addr}
                      onClick={() => selectAccount(account)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-accent bg-accent/10 text-white'
                          : 'border-base-700 bg-base-900 text-base-400 hover:border-base-500 hover:text-base-200'
                      }`}
                    >
                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          isSelected ? 'bg-accent' : 'bg-base-700'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{account.name}</div>
                        <div className="font-mono text-xs text-base-500 truncate">{short}</div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          account.source === 'host'
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-blue-500/20 text-blue-300'
                        }`}
                      >
                        {account.source === 'host' ? 'Host' : 'Dev'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Link
              to="/contract/arena"
              className="theme-button btn-primary w-full font-black py-4 rounded-xl text-base transition-all transform hover:scale-105 uppercase tracking-wider text-center"
            >
              Contract Arena
            </Link>

            <button
              onClick={disconnect}
              className="text-base-500 hover:text-base-300 text-sm transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
