export default function Battle() {
  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4">
        The Battle Phase
      </h2>
      <div className="space-y-3 text-warm-300 text-sm lg:text-base leading-relaxed">
        <p>
          After the shop, your board fights an opponent's board{' '}
          <span className="text-yellow-400 font-bold">automatically</span>. The
          front unit on each side clashes first.
        </p>
        <p>
          Units deal damage equal to their{' '}
          <span className="text-red-400 font-bold">attack</span> and lose{' '}
          <span className="text-green-400 font-bold">health</span> when hit. A
          unit with 0 health is destroyed.
        </p>
        <p>
          If you win the battle, you earn a win. If you lose, you lose a life.
          Draws have no effect.
        </p>
      </div>
    </div>
  );
}
