export default function Bag() {
  return (
    <div>
      <div className="flex flex-row items-center gap-4 lg:gap-8">
        {/* Card gallery grid */}
        <div className="shrink-0 rounded-xl border border-base-700/50 bg-base-950 p-2 lg:p-3">
          <div className="grid grid-cols-5 gap-1 lg:gap-1.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-6 h-8 lg:w-8 lg:h-11 rounded-sm bg-base-800 border border-base-600/60 flex items-center justify-center"
              >
                <span className="text-[7px] lg:text-[9px]">🃏</span>
              </div>
            ))}
          </div>
          <div className="text-center mt-1.5">
            <span className="text-base-500 text-[8px] lg:text-[10px] font-bold uppercase tracking-wider">
              50 Cards
            </span>
          </div>
        </div>

        {/* Text */}
        <div className="space-y-2 lg:space-y-3 text-base-300 text-sm lg:text-base leading-relaxed">
          <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white">
            Your Bag
          </h2>
          <p>
            At the start of each run, a{' '}
            <span className="text-white font-bold">bag of 50 cards</span> is randomly generated for
            you from the card set.
          </p>
          <p>
            Each round, you draw cards from this bag into your hand. The bag is your{' '}
            <span className="text-accent font-bold">entire arsenal</span> for the run. Every
            card you'll ever see comes from it.
          </p>
          <p>
            Check your bag early! Knowing what's inside lets you{' '}
            <span className="text-positive font-bold">plan ahead</span>. Spot powerful combos,
            identify key cards, and build a strategy before the pressure is on.
          </p>
        </div>
      </div>
    </div>
  );
}
