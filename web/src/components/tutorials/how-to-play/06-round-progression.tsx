export default function RoundProgression() {
  return (
    <div>
      <div className="flex flex-row items-center gap-4 lg:gap-8">
        {/* Round / Mana table (vertical) */}
        <div className="shrink-0 rounded-xl border border-base-700/50 bg-base-950 p-2 lg:p-3">
          <table className="text-xs lg:text-sm border-collapse">
            <thead>
              <tr>
                <th className="px-2 lg:px-3 py-1 text-gold font-bold border-b border-base-700 text-left">Round</th>
                <th className="px-2 lg:px-3 py-1 text-mana-blue font-bold border-b border-base-700 text-left">Mana</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, i) => (
                <tr key={i}>
                  <td className="px-2 lg:px-3 py-0.5 text-base-400 font-mono text-center">{i < 7 ? i + 1 : '8+'}</td>
                  <td className="px-2 lg:px-3 py-0.5 text-white font-mono text-center">{i + 3}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Text */}
        <div className="space-y-2 lg:space-y-3 text-base-300 text-sm lg:text-base leading-relaxed">
          <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white">
            Round Progression
          </h2>
          <p>
            Units on your board <span className="text-white font-bold">carry over</span> between rounds.
            This means you can continue to use them for future battles,
            or <span className="text-defeat-red font-bold">burn</span> them for future resources!
          </p>
          <p>
            Cards you don't use go <span className="text-accent-emerald font-bold">back into your bag</span> and
            can be drawn again later.
            Burned cards are <span className="text-defeat-red font-bold">gone for good</span>,
            so you can thin your bag to control and improve your future shop draws.
          </p>
          <p>
            You start with a limit of <span className="text-mana-blue font-bold">3 mana</span>. Each{' '}
            <span className="text-gold font-bold">round</span>, your mana limit grows
            by <span className="text-mana-blue font-bold">1</span>, up to a maximum
            of <span className="text-mana-blue font-bold">10</span>, letting you
            play stronger cards as the game goes on.
          </p>
        </div>
      </div>
    </div>
  );
}
