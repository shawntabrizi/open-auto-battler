export default function Strategy() {
  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4 lg:mb-6 text-center">
        Strategy & Board Position
      </h2>

      {/* Position diagram — both boards facing each other */}
      <div className="flex items-center justify-center gap-2 lg:gap-4 mb-4 lg:mb-6">
        {/* Player board */}
        <div className="flex gap-1 lg:gap-1.5">
          {['5', '4', '3', '2', '1'].map((pos, i) => (
            <div key={`p${pos}`}>
              <div
                className={`w-8 h-11 lg:w-12 lg:h-[4rem] rounded border-2 flex items-center justify-center text-xs lg:text-base font-stat font-bold ${
                  i === 4
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-dashed border-warm-600/40 text-warm-600'
                }`}
              >
                {pos}
              </div>
            </div>
          ))}
        </div>

        {/* Clash indicator with shared label */}
        <div className="flex flex-col items-center shrink-0 gap-1">
          <span className="text-lg lg:text-2xl">⚔️</span>
          <span className="text-[7px] lg:text-[10px] text-gold font-bold uppercase">← Attack first →</span>
        </div>

        {/* Enemy board (mirrored) */}
        <div className="flex gap-1 lg:gap-1.5">
          {['1', '2', '3', '4', '5'].map((pos, i) => (
            <div key={`e${pos}`}>
              <div
                className={`w-8 h-11 lg:w-12 lg:h-[4rem] rounded border-2 flex items-center justify-center text-xs lg:text-base font-stat font-bold ${
                  i === 0
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-dashed border-warm-600/40 text-warm-600'
                }`}
              >
                {pos}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 text-warm-300 text-sm lg:text-base leading-relaxed">
        <p>
          The unit in <span className="text-gold font-bold">position 1</span> (front) fights first.
          When it falls, position 2 steps up, and so on.
        </p>
        <p>
          Combat is <span className="text-gold font-bold">deterministic</span>.
          The same battle will always produce the same result. The only luck is which cards you draw.
        </p>
        <p>
          When abilities trigger, <span className="text-gold font-bold">stronger units act first</span>:
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
