export default function Strategy() {
  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4 lg:mb-6 text-center">
        Strategy & Board Position
      </h2>

      {/* Position diagram */}
      <div className="flex items-center justify-center gap-1 lg:gap-2 mb-4 lg:mb-6">
        {['5', '4', '3', '2', '1'].map((pos, i) => (
          <div key={pos} className="flex flex-col items-center gap-1">
            <div
              className={`w-10 h-14 lg:w-14 lg:h-[4.5rem] rounded border-2 flex items-center justify-center text-sm lg:text-lg font-stat font-bold ${
                i === 4
                  ? 'border-amber-400 bg-amber-900/30 text-amber-400'
                  : 'border-dashed border-warm-600/40 text-warm-600'
              }`}
            >
              {pos}
            </div>
            {i === 4 && (
              <span className="text-[8px] lg:text-xs text-amber-400 font-bold uppercase">Front</span>
            )}
          </div>
        ))}
        <div className="mx-2 lg:mx-4 text-warm-500 text-xs lg:text-sm">→ attacks first</div>
      </div>

      <div className="space-y-3 text-warm-300 text-sm lg:text-base leading-relaxed">
        <p>
          The unit in <span className="text-amber-400 font-bold">position 1</span> (front) fights first.
          When it falls, position 2 steps up, and so on.
        </p>
        <p>
          Combat has <span className="text-yellow-400 font-bold">no randomness</span> —
          the same boards always produce the same result. The only luck is which cards you draw.
        </p>
        <p>
          When abilities trigger, <span className="text-yellow-400 font-bold">stronger units act first</span> —
          highest attack goes first, then highest health, then front position.
        </p>
        <p>
          <span className="text-white font-bold">Every decision counts.</span> Experiment with
          board order, card synergies, and when to burn versus play to find the winning edge.
        </p>
      </div>
    </div>
  );
}
