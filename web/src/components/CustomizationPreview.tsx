import { useCustomizationStore } from '../store/customizationStore';
import { IpfsImage } from './IpfsImage';

export function CustomizationPreview() {
  const selections = useCustomizationStore((s) => s.selections);

  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
      <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">Live Preview</h3>

      {/* Mini game mockup */}
      <div className="rounded-xl overflow-hidden border border-white/10">
        {/* HUD bar */}
        <div className="h-6 bg-gray-900/80 border-b border-gray-700 flex items-center px-2 gap-2">
          {selections.playerAvatar && (
            <div className="w-4 h-4 rounded-full overflow-hidden border border-yellow-500/50 flex-shrink-0">
              <IpfsImage src={selections.playerAvatar.imageUrl} alt="avatar" className="w-full h-full object-cover" />
            </div>
          )}
          <span className="text-red-500 text-[8px]">&#9829;&#9829;&#9829;</span>
          <span className="text-[8px] text-slate-400 ml-auto">R1</span>
          <span className="text-yellow-500 text-[8px]">&#9733;</span>
        </div>

        {/* Board area */}
        <div
          className="h-24 relative flex items-center justify-center gap-1 p-2"
          style={selections.boardBackground ? {
            backgroundImage: `url(${selections.boardBackground.imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : { background: 'rgb(30 41 59)' }}
        >
          {selections.boardBackground && (
            <div className="absolute inset-0 bg-slate-900/50" />
          )}
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="relative w-8 h-12 bg-slate-800/80 rounded border border-gray-600 flex items-center justify-center z-10">
              {i <= 3 && (
                <>
                  <span className="text-[8px]">&#128065;</span>
                  {selections.cardStyle && (
                    <img
                      src={selections.cardStyle.imageUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Mana bar */}
        <div className="h-3 bg-slate-800 flex items-center px-2">
          <div className="w-8 h-1.5 bg-blue-500 rounded-full" />
        </div>

        {/* Hand area */}
        <div
          className="h-14 relative flex items-center justify-center gap-1 p-2 border-t border-gray-600"
          style={selections.handBackground ? {
            backgroundImage: `url(${selections.handBackground.imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : { background: 'rgb(30 41 59)' }}
        >
          {selections.handBackground && (
            <div className="absolute inset-0 bg-slate-900/40" />
          )}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="relative w-6 h-9 bg-slate-800/80 rounded border border-gray-600 flex items-center justify-center z-10">
              <span className="text-[6px]">&#127183;</span>
              {selections.cardStyle && (
                <img
                  src={selections.cardStyle.imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
