import { useContractStore } from '../store/contractStore';
import { TopBar } from './TopBar';
import { Link } from 'react-router-dom';
import { useState } from 'react';

/** Contract mode main menu — connect wallet and choose game mode. */
export function ContractMenuPage() {
  const { isConnected, isConnecting, connect, disconnect, connectionError, rpcUrl, contractAddress, setConfig } = useContractStore();
  const [editRpc, setEditRpc] = useState(rpcUrl);
  const [editContract, setEditContract] = useState(contractAddress);

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/" backLabel="Home" title="Smart Contract" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 gap-6">
        <h1 className="theme-title-text text-2xl lg:text-4xl font-black italic tracking-tighter text-transparent bg-clip-text">
          CONTRACT MODE
        </h1>
        <p className="text-base-400 text-sm max-w-md text-center">
          Play on a PolkaVM smart contract via Ethereum JSON-RPC. Connect MetaMask or any injected wallet.
        </p>

        {!isConnected ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <div className="w-full">
              <label className="block text-xs text-base-500 mb-1">RPC Endpoint</label>
              <input
                type="text"
                value={editRpc}
                onChange={(e) => setEditRpc(e.target.value)}
                className="w-full bg-base-900 border border-base-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="w-full">
              <label className="block text-xs text-base-500 mb-1">Contract Address</label>
              <input
                type="text"
                value={editContract}
                onChange={(e) => setEditContract(e.target.value)}
                className="w-full bg-base-900 border border-base-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
            <button
              onClick={() => {
                setConfig(editRpc, editContract);
                void connect();
              }}
              disabled={isConnecting}
              className="theme-button btn-primary w-full font-bold py-3 rounded-xl text-sm transition-all transform hover:scale-105 disabled:opacity-50"
            >
              {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>
            {connectionError && (
              <p className="max-w-md rounded-xl theme-error-panel border px-3 py-2 text-center text-xs text-negative">
                {connectionError}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            <div className="text-center">
              <p className="text-positive text-sm font-medium">Connected</p>
              <p className="text-base-500 text-xs font-mono mt-1">
                {useContractStore.getState().selectedAccount?.address?.slice(0, 10)}...
              </p>
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
