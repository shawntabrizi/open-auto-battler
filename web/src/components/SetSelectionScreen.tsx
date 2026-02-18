import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';

export function SetSelectionScreen() {
  const { setMetas, startGame, previewSet } = useGameStore();
  const [selectedId, setSelectedId] = useState(setMetas[0]?.id ?? 0);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center bg-slate-900 p-6 lg:p-10 rounded-2xl lg:rounded-3xl border border-white/5 shadow-2xl w-full max-w-md lg:max-w-lg">
        <h2 className="text-2xl lg:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 mb-2">
          SELECT A SET
        </h2>
        <p className="text-slate-500 text-sm mb-6 lg:mb-8">
          Choose a card set to play with.
        </p>

        {setMetas.length > 0 ? (
          <div className="flex flex-col gap-4 max-w-sm mx-auto">
            <div className="flex items-center gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="flex-1 bg-slate-800 border border-white/10 text-white text-sm rounded-lg px-4 py-3 focus:outline-none focus:border-yellow-500/50 cursor-pointer"
              >
                {[...setMetas].sort((a, b) => a.id - b.id).map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {meta.name} (#{meta.id})
                  </option>
                ))}
              </select>
              <button
                onClick={() => previewSet(selectedId)}
                className="px-3 py-3 text-xs font-bold border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 rounded-lg transition-all shrink-0"
              >
                PREVIEW
              </button>
            </div>

            <button
              onClick={() => startGame(selectedId)}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black px-8 py-3 rounded-full text-sm transition-all transform hover:scale-105 shadow-lg shadow-yellow-500/20"
            >
              PLAY
            </button>
          </div>
        ) : (
          <div className="text-slate-600 italic py-8">No sets available</div>
        )}

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
