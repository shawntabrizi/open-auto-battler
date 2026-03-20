export default function Closing() {
  return (
    <div className="text-center">
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4 lg:mb-6">
        Achievements & Beyond
      </h2>

      <div className="flex justify-center gap-6 lg:gap-10 mb-4 lg:mb-6">
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-amber-800 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 lg:w-6 lg:h-6">
              <path d="M12 2l2.94 6.34L22 9.27l-5.15 4.64L18.18 22 12 18.27 5.82 22l1.33-8.09L2 9.27l7.06-.93z" />
            </svg>
          </div>
          <span className="text-amber-400 font-bold text-xs lg:text-sm">Bronze</span>
          <span className="text-warm-500 text-[10px] lg:text-xs">Win a battle with this card on board</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-gray-400 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 lg:w-6 lg:h-6">
              <path d="M12 2l2.94 6.34L22 9.27l-5.15 4.64L18.18 22 12 18.27 5.82 22l1.33-8.09L2 9.27l7.06-.93z" />
            </svg>
          </div>
          <span className="text-gray-300 font-bold text-xs lg:text-sm">Silver</span>
          <span className="text-warm-500 text-[10px] lg:text-xs">Complete a 10-win run with this card</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-yellow-400 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 lg:w-6 lg:h-6">
              <path d="M12 2l2.94 6.34L22 9.27l-5.15 4.64L18.18 22 12 18.27 5.82 22l1.33-8.09L2 9.27l7.06-.93z" />
            </svg>
          </div>
          <span className="text-yellow-400 font-bold text-xs lg:text-sm">Gold</span>
          <span className="text-warm-500 text-[10px] lg:text-xs">Perfect 10-0 run with this card</span>
        </div>
      </div>

      <p className="text-warm-300 text-sm lg:text-lg leading-relaxed max-w-md mx-auto mb-4">
        Every card has three achievement tiers to earn. Can you collect them all?
      </p>

      <p className="text-lg lg:text-2xl font-title font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mt-6">
        Good luck & have fun!
      </p>
    </div>
  );
}
