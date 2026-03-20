import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import type { CardView } from '../types';

const FAN_POSITIONS = [
  { x: '-4.5rem', rot: '-12deg', arc: '0.8rem' },
  { x: '-2.2rem', rot: '-6deg', arc: '0.2rem' },
  { x: '0rem', rot: '0deg', arc: '0rem' },
  { x: '2.2rem', rot: '6deg', arc: '0.2rem' },
  { x: '4.5rem', rot: '12deg', arc: '0.8rem' },
];

// Center card on top, edges underneath: [1, 2, 3, 2, 1]
const Z_ORDER = [1, 2, 3, 2, 1];

export function CardFan({ cards }: { cards: CardView[] }) {
  const display = cards.slice(0, 5);
  const startIdx = Math.floor((5 - display.length) / 2);

  return (
    <div className="set-card-fan">
      {display.map((card, i) => {
        const pos = FAN_POSITIONS[startIdx + i];
        const z = Z_ORDER[startIdx + i];
        const art = getCardArtSm(card.id);
        const fanStyle = {
          '--fan-x': pos.x,
          '--fan-rot': pos.rot,
          '--fan-arc': pos.arc,
          zIndex: z,
        } as React.CSSProperties;

        return art ? (
          <img
            key={card.id}
            src={art}
            alt={card.name}
            className="set-card-fan-img"
            style={fanStyle}
          />
        ) : (
          <div
            key={card.id}
            className="set-card-fan-card flex items-center justify-center"
            style={fanStyle}
          >
            {getCardEmoji(card.id)}
          </div>
        );
      })}
    </div>
  );
}
