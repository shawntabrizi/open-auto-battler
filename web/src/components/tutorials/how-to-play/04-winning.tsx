export default function Winning() {
  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4">
        Winning the Game
      </h2>
      <div className="space-y-3 text-warm-300 text-sm lg:text-base leading-relaxed">
        <p>
          You start with <span className="text-red-400 font-bold">3 lives</span>.
          Reach <span className="text-yellow-400 font-bold">10 wins</span> before
          running out of lives to achieve victory!
        </p>
        <p>
          Board positioning matters — the front unit takes hits first. Place
          tanky units up front and damage dealers behind them.
        </p>
        <p>
          Cards have unique abilities that trigger during battle or in the shop.
          Experiment with different combinations to find powerful synergies!
        </p>
      </div>
    </div>
  );
}
