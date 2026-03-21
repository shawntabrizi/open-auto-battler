export default function Shop() {
  return (
    <div>
      <div className="flex flex-row items-center gap-4 lg:gap-8">
        {/* Mini game mockup */}
        <div className="rounded-xl border border-base-700/50 bg-base-950 w-48 lg:w-64 shrink-0 aspect-video flex flex-col">
          {/* HUD bar — star, heart, round */}
          <div className="h-[8%] bg-base-900/80 border-b border-base-700 flex items-center px-2 gap-1.5 shrink-0">
            <span className="text-gold text-[7px]">&#9733; 2</span>
            <span className="text-defeat-red text-[7px]">&#9829; 3</span>
            <span className="text-base-400 text-[7px]">Round 3</span>
          </div>

          {/* Board label + area */}
          <div className="text-[6px] text-base-500 font-bold uppercase tracking-wider text-center bg-board-bg pt-0.5">
            BOARD
          </div>
          <div className="flex-[3] flex items-center justify-center gap-1 px-2 bg-board-bg">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex-1 aspect-[3/4] rounded border-2 border-dashed border-base-600/40 flex items-center justify-center"
              >
                {i > 3 && (
                  <div className="w-full h-full rounded bg-base-800 border border-base-600 flex items-center justify-center">
                    <span className="text-[7px]">&#9876;&#65039;</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mana bar */}
          <div className="h-[6%] bg-base-800 flex items-center px-2 gap-1 shrink-0">
            <span className="text-[6px] text-mana-blue font-bold">MANA</span>
            <div className="flex-1 h-1 bg-base-700 rounded-full overflow-hidden">
              <div className="w-3/5 h-full bg-mana-blue rounded-full" />
            </div>
            <span className="text-[6px] text-base-400">3/5</span>
          </div>

          {/* Hand label + area */}
          <div className="text-[6px] text-base-500 font-bold uppercase tracking-wider text-center bg-shop-bg border-t border-base-700/50 pt-0.5">
            HAND
          </div>
          <div className="flex-[2] flex items-center justify-center gap-1 px-2 bg-shop-bg">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`flex-1 aspect-[3/4] rounded flex items-center justify-center ${
                  i === 2 || i === 4
                    ? 'border-2 border-dashed border-base-600/40'
                    : 'bg-base-800 border border-base-600'
                }`}
              >
                {i !== 2 && i !== 4 && <span className="text-[5px]">&#127183;</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Text */}
        <div className="space-y-2 lg:space-y-3 text-base-300 text-sm lg:text-base leading-relaxed">
          <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white">The Shop Phase</h2>
          <p>
            Each round starts with the <span className="text-gold font-bold">Shop Phase</span>
            .
          </p>
          <p>
            You draw <span className="text-white font-bold">5 random cards</span> from your bag into
            your hand.
          </p>
          <p>
            <span className="text-defeat-red font-bold">Burn</span> cards from your hand or your board
            to gain <span className="text-mana-blue font-bold">mana</span>.
          </p>
          <p>
            <span className="text-accent-emerald font-bold">Play</span> cards from your hand onto the
            board by spending mana.
          </p>
          <p>
            Tap a card to select it, then tap an empty board slot to place
            it. You can also drag cards directly to the board.
          </p>
        </div>
      </div>
    </div>
  );
}
