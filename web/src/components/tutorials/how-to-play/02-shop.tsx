export default function Shop() {
  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4">
        The Shop Phase
      </h2>
      <div className="space-y-3 text-warm-300 text-sm lg:text-base leading-relaxed">
        <p>
          Each round starts with the <span className="text-yellow-400 font-bold">Shop Phase</span>.
          You draw a hand of cards from your bag.
        </p>
        <p>
          You can <span className="text-green-400 font-bold">play</span> cards
          from your hand onto your board (costs mana), or{' '}
          <span className="text-red-400 font-bold">burn</span> cards to gain
          mana.
        </p>
        <p>
          Your mana limit increases each round, letting you play stronger cards
          as the game progresses.
        </p>
      </div>
    </div>
  );
}
