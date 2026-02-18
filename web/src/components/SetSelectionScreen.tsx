import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';

export function SetSelectionScreen() {
  const { setMetas, startGame, previewSet } = useGameStore();

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center bg-slate-900 p-6 lg:p-10 rounded-2xl lg:rounded-3xl border border-white/5 shadow-2xl w-full max-w-md lg:max-w-lg">
        <h2 className="text-2xl lg:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 mb-2">
          SELECT A SET
        </h2>
        <p className="text-slate-500 text-sm mb-6 lg:mb-8">
          Choose a card set to play with. Preview cards before starting.
        </p>

        <div className="flex flex-col gap-3 lg:gap-4">
          {setMetas.map((meta) => (
            <div
              key={meta.id}
              className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="text-left">
                <div className="text-base lg:text-lg font-bold text-white">{meta.name}</div>
                <div className="text-xs text-slate-500 font-mono">Set #{meta.id}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => previewSet(meta.id)}
                  className="px-3 py-2 text-xs font-bold border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 rounded-lg transition-all"
                >
                  PREVIEW
                </button>
                <button
                  onClick={() => startGame(meta.id)}
                  className="px-4 py-2 text-xs font-bold bg-yellow-500 hover:bg-yellow-400 text-slate-950 rounded-lg transition-all transform hover:scale-105 shadow-lg shadow-yellow-500/20"
                >
                  PLAY
                </button>
              </div>
            </div>
          ))}
          {setMetas.length === 0 && (
            <div className="text-slate-600 italic py-8">No sets available</div>
          )}
        </div>

        <Link
          to="/"
          className="inline-block mt-6 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          &larr; Back to Main Menu
        </Link>
      </div>
    </div>
  );
}
