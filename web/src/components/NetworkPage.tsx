import { useState } from 'react';
import { useSettingsStore, PRESET_ENDPOINTS } from '../store/settingsStore';
import { useBlockchainStore } from '../store/blockchainStore';
import { TopBar } from './TopBar';
import toast from 'react-hot-toast';

type EndpointOption = 'local' | 'hosted' | 'custom';

function getOptionFromEndpoint(endpoint: string): EndpointOption {
  if (endpoint === PRESET_ENDPOINTS.local) return 'local';
  if (endpoint === PRESET_ENDPOINTS.hosted) return 'hosted';
  return 'custom';
}

export function NetworkPage() {
  const { endpoint, setEndpoint } = useSettingsStore();
  const { connect, isConnected, blockNumber, connectionError } = useBlockchainStore();

  const [selected, setSelected] = useState<EndpointOption>(getOptionFromEndpoint(endpoint));
  const [customUrl, setCustomUrl] = useState(
    getOptionFromEndpoint(endpoint) === 'custom' ? endpoint : ''
  );

  const resolvedUrl =
    selected === 'local'
      ? PRESET_ENDPOINTS.local
      : selected === 'hosted'
        ? PRESET_ENDPOINTS.hosted
        : customUrl;

  const isCurrentEndpoint = resolvedUrl === endpoint;
  const canConnect = resolvedUrl && (selected !== 'custom' || customUrl.startsWith('ws'));

  const handleConnect = async () => {
    if (!canConnect) return;
    setEndpoint(resolvedUrl);
    const connected = await connect();
    if (connected) {
      toast.success('Connected to ' + resolvedUrl);
    } else {
      toast.error('Failed to connect');
    }
  };

  const options: { key: EndpointOption; label: string; description: string; url?: string }[] = [
    {
      key: 'local',
      label: 'Localhost',
      description: 'Local development node',
      url: PRESET_ENDPOINTS.local,
    },
    {
      key: 'hosted',
      label: 'Hosted Node',
      description: 'Remote server',
      url: PRESET_ENDPOINTS.hosted,
    },
    {
      key: 'custom',
      label: 'Custom',
      description: 'Enter a WebSocket URL',
    },
  ];

  return (
    <div className="fixed inset-0 bg-warm-950 text-white flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Network" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[15vh]">
          {/* Endpoint selection */}
          <div className="mb-4 lg:mb-6">
            <h2 className="text-sm lg:text-base font-semibold text-warm-300 mb-2 lg:mb-3">
              WebSocket Endpoint
            </h2>
            <div className="flex flex-col gap-2">
              {options.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSelected(opt.key)}
                  className={`w-full text-left p-3 lg:p-4 rounded-xl border transition-all ${
                    selected === opt.key
                      ? 'border-yellow-500/60 bg-yellow-500/10'
                      : 'border-warm-700 bg-warm-900/30 hover:border-warm-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm lg:text-base">{opt.label}</div>
                      <div className="text-warm-500 text-[10px] lg:text-xs">{opt.description}</div>
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
                  {opt.url && selected === opt.key && (
                    <div className="mt-2 text-[10px] lg:text-xs font-mono text-warm-500">
                      {opt.url}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Custom URL input */}
            {selected === 'custom' && (
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="ws://..."
                className="w-full mt-2 p-3 rounded-xl border border-warm-700 bg-warm-900/50 text-sm font-mono text-white placeholder-warm-600 focus:outline-none focus:border-yellow-500/60"
              />
            )}
          </div>

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={!canConnect}
            className={`w-full p-3 lg:p-4 rounded-xl font-bold text-sm lg:text-base transition-all ${
              canConnect
                ? 'bg-yellow-500 hover:bg-yellow-400 text-black active:scale-[0.98]'
                : 'bg-warm-800 text-warm-500 cursor-not-allowed'
            }`}
          >
            {isCurrentEndpoint && isConnected ? 'Reconnect' : 'Connect'}
          </button>

          {/* Connection status */}
          <div className="mt-3 lg:mt-4 p-3 rounded-xl border border-warm-800 bg-warm-900/30">
            <div className="flex items-center gap-2 text-xs lg:text-sm">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500 animate-pulse' : 'bg-warm-600'
                }`}
              />
              <span className="text-warm-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
              {isConnected && blockNumber !== null && (
                <span className="text-warm-600 font-mono ml-auto">
                  Block #{blockNumber.toLocaleString()}
                </span>
              )}
            </div>
            {connectionError && (
              <div className="mt-2 text-[10px] lg:text-xs text-red-300">{connectionError}</div>
            )}
            {isConnected && (
              <div className="mt-1 text-[10px] lg:text-xs font-mono text-warm-600 truncate">
                {endpoint}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
