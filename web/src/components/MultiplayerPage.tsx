import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { RotatePrompt } from './RotatePrompt';
import { QRCodeSVG } from 'qrcode.react';

export function MultiplayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    peer,
    initializePeer,
    myPeerId,
    opponentPeerId,
    status,
    connectToPeer,
    logs,
    isHost,
    lives,
    setLives,
  } = useMultiplayerStore();

  const [targetId, setTargetId] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [showLargeQR, setShowLargeQR] = useState(false);

  // Check if we have a join parameter
  const joinIdFromUrl = searchParams.get('join');

  // Get the join URL for QR code
  const joinUrl = myPeerId
    ? `${window.location.origin}${window.location.pathname}#/multiplayer?join=${myPeerId}`
    : '';

  // Check for join parameter in URL and auto-connect
  useEffect(() => {
    if (joinIdFromUrl && !peer && !autoJoining) {
      setAutoJoining(true);
      setTargetId(joinIdFromUrl);
      // Auto-initialize and connect
      initializePeer()
        .then(() => {
          connectToPeer(joinIdFromUrl);
        })
        .catch(console.error);
    }
  }, [joinIdFromUrl, peer, autoJoining, initializePeer, connectToPeer]);

  const handleHost = async () => {
    setInitializing(true);
    try {
      await initializePeer();
    } finally {
      setInitializing(false);
    }
  };

  const handleJoin = async () => {
    if (!peer) {
      try {
        await initializePeer();
      } catch (e) {
        console.error(e);
        return;
      }
    }
    connectToPeer(targetId);
  };

  const handleGoToGame = () => {
    void navigate('/multiplayer/game');
  };

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(joinUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyId = () => {
    void navigator.clipboard.writeText(myPeerId || '');
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="h-screen h-svh bg-board-bg flex flex-col items-center justify-center p-2 lg:p-4 overflow-hidden">
      {/* Header - smaller on mobile */}
      <div className="mb-2 lg:mb-8 text-center flex-shrink-0">
        <h1 className="text-lg lg:text-4xl font-bold text-white">P2P Multiplayer</h1>
        <p className="text-gray-400 text-[10px] lg:text-base hidden lg:block">WebRTC Battle Sync</p>
      </div>

      <div className="bg-gray-800 p-3 lg:p-8 rounded-lg w-full max-w-2xl text-white relative border-2 border-gray-700 shadow-2xl flex-shrink overflow-y-auto">
        <button
          onClick={() => navigate('/')}
          className="absolute top-2 right-2 lg:top-4 lg:right-4 text-gray-400 hover:text-white z-10"
          title="Back to Game"
        >
          ✕
        </button>

        {status === 'connected' || status === 'in-game' ? (
          <div className="text-center">
            <div className="w-12 h-12 lg:w-20 lg:h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-2 lg:mb-4 border-2 border-green-500">
              <span className="text-2xl lg:text-4xl">🔗</span>
            </div>
            <h2 className="text-lg lg:text-2xl font-bold text-green-400 mb-1 lg:mb-2">
              Connected!
            </h2>
            <p className="mb-3 lg:mb-6 text-gray-300 text-xs lg:text-base">
              Opponent:{' '}
              <span className="font-mono text-yellow-300 break-all">{opponentPeerId}</span>
            </p>
            {isHost && status === 'connected' && (
              <div className="mb-3 lg:mb-6">
                <label className="block text-xs lg:text-sm text-gray-400 mb-1 lg:mb-2">Lives</label>
                <div className="flex justify-center gap-2">
                  {[1, 3, 5, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => setLives(n)}
                      className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded font-bold text-sm lg:text-base transition-colors ${
                        lives === n
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleGoToGame}
              className="w-full max-w-xs mx-auto bg-blue-600 px-4 lg:px-6 py-2 lg:py-3 rounded font-bold hover:bg-blue-500 transition-colors text-sm lg:text-base"
            >
              {status === 'in-game' ? 'Return to Board' : 'Start Game'}
            </button>
          </div>
        ) : (
          <>
            {!peer ? (
              joinIdFromUrl ? (
                // Auto-joining from QR code scan
                <div className="text-center py-6 lg:py-8">
                  <div className="w-12 h-12 lg:w-16 lg:h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3 lg:mb-4"></div>
                  <h3 className="text-base lg:text-xl font-bold text-white mb-2">Connecting...</h3>
                  <p className="text-[10px] lg:text-sm text-gray-400">
                    Joining game:{' '}
                    <span className="font-mono text-yellow-400">
                      {joinIdFromUrl.slice(0, 12)}...
                    </span>
                  </p>
                </div>
              ) : (
                // Manual initialization
                <div className="text-center py-4 lg:py-8">
                  <button
                    onClick={handleHost}
                    disabled={initializing}
                    className="w-full max-w-xs mx-auto bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 py-3 lg:py-4 rounded-xl font-bold text-sm lg:text-lg transition-all active:scale-95 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {initializing ? (
                      <>
                        <div className="w-4 h-4 lg:w-5 lg:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Initializing...</span>
                      </>
                    ) : (
                      'Initialize Network'
                    )}
                  </button>
                  <p className="text-[10px] lg:text-sm text-gray-400 mt-2 lg:mt-4">
                    Generate your ID to host or join a game.
                  </p>
                </div>
              )
            ) : (
              <div className="flex flex-row lg:flex-col gap-3 lg:gap-6">
                {/* Left side on mobile: QR Code + Your ID */}
                <div className="flex flex-col gap-2 lg:gap-4 flex-shrink-0">
                  {/* QR Code Section */}
                  <div className="bg-gray-900 p-2 lg:p-5 rounded-xl border border-gray-700 text-center">
                    <div className="text-[8px] lg:text-xs text-gray-500 uppercase tracking-widest mb-1 lg:mb-3">
                      Scan to Join
                    </div>
                    <div className="flex justify-center mb-1 lg:mb-3">
                      <button
                        onClick={() => setShowLargeQR(true)}
                        className="bg-white p-1.5 lg:p-2 rounded-lg cursor-pointer hover:scale-105 transition-transform"
                        title="Click to enlarge"
                      >
                        <QRCodeSVG value={joinUrl} size={80} className="lg:hidden" level="M" />
                        <QRCodeSVG
                          value={joinUrl}
                          size={120}
                          className="hidden lg:block"
                          level="M"
                        />
                      </button>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="text-[10px] lg:text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {copiedLink ? '✓ Copied!' : 'Copy Link'}
                    </button>
                  </div>

                  {/* Peer ID Display */}
                  <div className="bg-gray-900 p-2 lg:p-4 rounded-xl border border-gray-700 text-center">
                    <div className="text-[8px] lg:text-xs text-gray-500 uppercase tracking-widest mb-0.5 lg:mb-1">
                      Your ID
                    </div>
                    <div className="text-[10px] lg:text-lg font-mono text-yellow-400 select-all break-all leading-tight">
                      {myPeerId}
                    </div>
                    <button
                      onClick={handleCopyId}
                      className="text-[10px] lg:text-sm text-blue-400 hover:text-blue-300 transition-colors mt-1"
                    >
                      {copiedId ? '✓ Copied!' : 'Copy ID'}
                    </button>
                  </div>
                </div>

                {/* Right side on mobile: Manual Join + Status */}
                <div className="flex-1 flex flex-col justify-center">
                  {/* Manual Join Section */}
                  <div className="lg:border-t lg:border-gray-700 lg:pt-6">
                    <label className="block text-[10px] lg:text-sm font-medium mb-1.5 lg:mb-3 text-gray-300">
                      Or Enter Opponent ID
                    </label>
                    <div className="flex gap-1.5 lg:gap-2">
                      <input
                        type="text"
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        placeholder="Opponent ID"
                        className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-2 lg:px-4 py-1.5 lg:py-2 font-mono text-[10px] lg:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button
                        onClick={handleJoin}
                        disabled={!targetId || status === 'connecting'}
                        className="bg-green-600 hover:bg-green-500 px-3 lg:px-6 rounded-lg font-bold disabled:opacity-50 transition-colors text-xs lg:text-sm flex-shrink-0"
                      >
                        Join
                      </button>
                    </div>
                  </div>

                  {status === 'connecting' && (
                    <div className="text-center text-yellow-400 animate-pulse font-medium text-xs mt-3">
                      Connecting...
                    </div>
                  )}

                  {/* Logs - inline on mobile */}
                  <div className="mt-3 lg:mt-6 pt-2 lg:pt-4 border-t border-gray-700">
                    <button
                      onClick={() => setShowLogs(!showLogs)}
                      className="text-[8px] lg:text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                    >
                      {showLogs ? '▼' : '▶'} Logs
                    </button>
                    {showLogs && (
                      <div className="mt-1 lg:mt-2 h-16 lg:h-32 overflow-y-auto bg-black/50 p-1.5 lg:p-3 text-[7px] lg:text-[10px] font-mono text-gray-400 rounded-lg border border-gray-800">
                        {logs.map((l, i) => (
                          <div
                            key={i}
                            className="mb-0.5 lg:mb-1 border-b border-gray-900 pb-0.5 lg:pb-1 last:border-0"
                          >
                            <span className="text-gray-600">
                              [{new Date(l.timestamp).toLocaleTimeString()}]
                            </span>{' '}
                            {l.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => navigate('/')}
        className="mt-2 lg:mt-8 text-gray-500 hover:text-white underline text-[10px] lg:text-sm flex-shrink-0"
      >
        ← Back to Menu
      </button>

      {/* Large QR Code Modal */}
      {showLargeQR && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setShowLargeQR(false)}
        >
          <div className="bg-white p-4 lg:p-6 rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <QRCodeSVG value={joinUrl} size={250} level="M" />
            <p className="text-center text-gray-600 text-sm mt-3">Tap outside to close</p>
          </div>
        </div>
      )}

      <RotatePrompt />
    </div>
  );
}
