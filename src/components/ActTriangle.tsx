import { t } from "../lib/i18n";
import { RANK_COLORS, rankFamily, tierFromName, type TierRef } from "../lib/ranked";

const ROWS = 7;
const SIDE = 10;
const HEIGHT = SIDE * 0.866;

type Slot = { points: string };

function slots(): Slot[] {
  const list: Slot[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    const top = row * HEIGHT;
    const bottom = top + HEIGHT;
    const left = ((ROWS - row - 1) * SIDE) / 2;
    for (let index = 0; index < row * 2 + 1; index += 1) {
      const step = Math.floor(index / 2);
      if (index % 2 === 0) {
        const x = left + step * SIDE;
        list.push({ points: `${x},${bottom} ${x + SIDE},${bottom} ${x + SIDE / 2},${top}` });
      } else {
        const x = left + step * SIDE + SIDE / 2;
        list.push({ points: `${x},${top} ${x + SIDE},${top} ${x + SIDE / 2},${bottom}` });
      }
    }
  }
  return list;
}

const SLOTS = slots();

export const rankOf = (tier: TierRef) => tierFromName(tier.name) ?? tier.id ?? 0;

export function sortedWins(wins: TierRef[]): TierRef[] {
  return [...wins].sort((a, b) => rankOf(b) - rankOf(a));
}

export function ActTriangle({ wins, size }: { wins: TierRef[]; size: number }) {
  const sorted = sortedWins(wins).slice(0, SLOTS.length);
  const width = ROWS * SIDE;
  const height = ROWS * HEIGHT;
  return (
    <svg
      className="act-triangle"
      width={size}
      height={(size * height) / width}
      viewBox={`-1 -1 ${width + 2} ${height + 2}`}
      role="img"
      aria-label={t(`${wins.length} victoires classées par rang`, `${wins.length} ${wins.length === 1 ? "win" : "wins"} ranked by tier`)}
    >
      {SLOTS.map((slot, index) => {
        const win = sorted[index];
        const family = win ? rankFamily(win.name) : null;
        return <polygon key={index} points={slot.points} className={family ? undefined : "act-slot-empty"} fill={family ? RANK_COLORS[family] : undefined} />;
      })}
    </svg>
  );
}
