import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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

  const joinIdFromUrl = searchParams.get('join');

  const joinUrl = myPeerId
    ? `${window.location.origin}${window.location.pathname}#/multiplayer?join=${myPeerId}`
    : '';

  useEffect(() => {
    if (joinIdFromUrl && !peer && !autoJoining) {
      setAutoJoining(true);
      setTargetId(joinIdFromUrl);
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
    <div className="min-h-screen min-h-svh bg-surface-dark flex flex-col items-center justify-center p-3 lg:p-4 overflow-hidden relative">
      {/* Atmospheric background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(59, 130, 246, 0.08), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(91, 143, 170, 0.05), transparent 50%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm lg:max-w-lg">
        {/* Header */}
        <div className="mb-4 lg:mb-8 text-center">
          <h1 className="font-title text-2xl lg:text-4xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            P2P MULTIPLAYER
          </h1>
          <p className="font-heading text-warm-400 text-[10px] lg:text-sm tracking-widest uppercase mt-1">
            WebRTC Battle Sync
          </p>
        </div>

        {/* Main Card */}
        <div className="w-full bg-warm-900/60 border border-warm-700/40 rounded-xl lg:rounded-2xl p-3 lg:p-8 backdrop-blur-sm relative">
          {/* Close button */}
          <Link
            to="/"
            className="absolute top-2 right-2 lg:top-4 lg:right-4 text-warm-500 hover:text-warm-200 transition-colors text-sm z-10"
          >
            &larr; <span className="hidden lg:inline">Back</span>
          </Link>

          {/* Connected State */}
          {status === 'connected' || status === 'in-game' ? (
            <div className="text-center pt-2">
              <div className="w-14 h-14 lg:w-20 lg:h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3 lg:mb-4 border-2 border-green-500/50">
                <span className="text-2xl lg:text-4xl">🔗</span>
              </div>
              <h2 className="text-lg lg:text-2xl font-heading font-bold text-green-400 mb-1 lg:mb-2">
                Connected
              </h2>
              <p className="mb-4 lg:mb-6 text-warm-400 text-xs lg:text-sm">
                Opponent:{' '}
                <span className="font-mono text-warm-200 break-all">{opponentPeerId}</span>
              </p>

              {isHost && status === 'connected' && (
                <div className="mb-4 lg:mb-6">
                  <label className="block text-[10px] lg:text-xs text-warm-500 uppercase tracking-wider font-heading mb-2">
                    Lives
                  </label>
                  <div className="flex justify-center gap-2">
                    {[1, 3, 5, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => setLives(n)}
                        className={`w-10 h-10 lg:w-12 lg:h-12 rounded-lg font-bold text-sm lg:text-base transition-all ${
                          lives === n
                            ? 'bg-red-500/20 text-red-400 border-2 border-red-500/60'
                            : 'bg-warm-800 text-warm-400 border border-warm-700 hover:border-warm-500'
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
                className="w-full max-w-xs mx-auto bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white font-heading font-bold py-2.5 lg:py-3 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 shadow-lg shadow-blue-500/20 uppercase tracking-wider"
              >
                {status === 'in-game' ? 'Return to Board' : 'Start Game'}
              </button>
            </div>

          /* Not initialized */
          ) : !peer ? (
            joinIdFromUrl ? (
              /* Auto-joining from QR */
              <div className="text-center py-8 lg:py-12">
                <div className="w-12 h-12 lg:w-16 lg:h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <h3 className="text-base lg:text-xl font-heading font-bold text-white mb-2">Connecting...</h3>
                <p className="text-[10px] lg:text-sm text-warm-400">
                  Joining game:{' '}
                  <span className="font-mono text-blue-400">
                    {joinIdFromUrl.slice(0, 12)}...
                  </span>
                </p>
              </div>
            ) : (
              /* Initialize button */
              <div className="text-center py-6 lg:py-10">
                <div className="text-4xl lg:text-5xl mb-4 lg:mb-6">🌐</div>
                <button
                  onClick={handleHost}
                  disabled={initializing}
                  className="w-full max-w-xs mx-auto bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 disabled:from-warm-700 disabled:to-warm-700 text-white font-heading font-bold py-3 lg:py-4 rounded-xl text-sm lg:text-lg transition-all active:scale-95 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 uppercase tracking-wider"
                >
                  {initializing ? (
                    <>
                      <div className="w-4 h-4 lg:w-5 lg:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Initializing...</span>
                    </>
                  ) : (
                    'Initialize Network'
                  )}
                </button>
                <p className="text-[10px] lg:text-sm text-warm-500 mt-3 lg:mt-4">
                  Generate your ID to host or join a game.
                </p>
              </div>
            )

          /* Peer initialized — lobby */
          ) : (
            <div className="flex flex-row lg:flex-col gap-3 lg:gap-6 pt-2">
              {/* Left: QR + ID */}
              <div className="flex flex-col gap-2 lg:gap-4 flex-shrink-0">
                {/* QR Code */}
                <div className="bg-warm-950/60 p-2 lg:p-5 rounded-xl border border-warm-700/40 text-center">
                  <div className="text-[8px] lg:text-xs text-warm-500 uppercase tracking-widest font-heading mb-1 lg:mb-3">
                    Scan to Join
                  </div>
                  <div className="flex justify-center mb-1.5 lg:mb-3">
                    <button
                      onClick={() => setShowLargeQR(true)}
                      className="bg-white p-1.5 lg:p-2 rounded-lg cursor-pointer hover:scale-105 transition-transform shadow-lg"
                      title="Click to enlarge"
                    >
                      <QRCodeSVG value={joinUrl} size={80} className="lg:hidden" level="M" />
                      <QRCodeSVG value={joinUrl} size={120} className="hidden lg:block" level="M" />
                    </button>
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className={`text-[10px] lg:text-sm transition-colors ${
                      copiedLink ? 'text-green-400' : 'text-blue-400 hover:text-blue-300'
                    }`}
                  >
                    {copiedLink ? '✓ Copied!' : 'Copy Link'}
                  </button>
                </div>

                {/* Peer ID */}
                <div className="bg-warm-950/60 p-2 lg:p-4 rounded-xl border border-warm-700/40 text-center">
                  <div className="text-[8px] lg:text-xs text-warm-500 uppercase tracking-widest font-heading mb-0.5 lg:mb-1">
                    Your ID
                  </div>
                  <div className="text-[10px] lg:text-base font-mono text-blue-400 select-all break-all leading-tight">
                    {myPeerId}
                  </div>
                  <button
                    onClick={handleCopyId}
                    className={`text-[10px] lg:text-sm mt-1 transition-colors ${
                      copiedId ? 'text-green-400' : 'text-warm-400 hover:text-warm-200'
                    }`}
                  >
                    {copiedId ? '✓ Copied!' : 'Copy ID'}
                  </button>
                </div>
              </div>

              {/* Right: Join + Logs */}
              <div className="flex-1 flex flex-col justify-center">
                {/* Manual Join */}
                <div className="lg:border-t lg:border-warm-700/40 lg:pt-6">
                  <label className="block text-[10px] lg:text-xs font-heading text-warm-500 uppercase tracking-wider mb-1.5 lg:mb-3">
                    Or Enter Opponent ID
                  </label>
                  <div className="flex gap-1.5 lg:gap-2">
                    <input
                      type="text"
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      placeholder="Opponent ID"
                      className="flex-1 min-w-0 bg-warm-950/60 border border-warm-700/40 rounded-lg px-2 lg:px-4 py-1.5 lg:py-2.5 font-mono text-[10px] lg:text-sm text-white placeholder-warm-600 focus:outline-none focus:border-blue-500/50"
                    />
                    <button
                      onClick={handleJoin}
                      disabled={!targetId || status === 'connecting'}
                      className="bg-green-600 hover:bg-green-500 px-3 lg:px-6 rounded-lg font-heading font-bold disabled:opacity-50 transition-colors text-xs lg:text-sm flex-shrink-0 uppercase tracking-wider"
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

                {/* Logs */}
                <div className="mt-3 lg:mt-6 pt-2 lg:pt-4 border-t border-warm-700/40">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-[8px] lg:text-xs text-warm-500 hover:text-warm-300 transition-colors flex items-center gap-1 font-heading uppercase tracking-wider"
                  >
                    {showLogs ? '▼' : '▶'} Logs
                  </button>
                  {showLogs && (
                    <div className="mt-1 lg:mt-2 h-16 lg:h-32 overflow-y-auto bg-black/40 p-1.5 lg:p-3 text-[7px] lg:text-[10px] font-mono text-warm-400 rounded-lg border border-warm-800/50">
                      {logs.map((l, i) => (
                        <div
                          key={i}
                          className="mb-0.5 lg:mb-1 border-b border-warm-800/30 pb-0.5 lg:pb-1 last:border-0"
                        >
                          <span className="text-warm-600">
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
        </div>

        {/* Back link */}
        <Link
          to="/"
          className="mt-4 lg:mt-8 text-warm-500 hover:text-warm-200 text-[10px] lg:text-sm transition-colors font-heading tracking-wider uppercase"
        >
          &larr; Back to Menu
        </Link>
      </div>

      {/* Large QR Modal */}
      {showLargeQR && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setShowLargeQR(false)}
        >
          <div className="bg-white p-4 lg:p-6 rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <QRCodeSVG value={joinUrl} size={250} level="M" />
            <p className="text-center text-warm-600 text-sm mt-3">Tap outside to close</p>
          </div>
        </div>
      )}

      <RotatePrompt />
    </div>
  );
}
