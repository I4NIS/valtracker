import { tierIcon, tierNameById } from "../lib/assets";
import { fadeIn } from "./GameArt";

type Props = {
  tier: number | null | undefined;
  size: number;
  label?: string;
};

export function RankBadge({ tier, size, label }: Props) {
  const name = label ?? tierNameById(tier);
  return (
    <span className="rank-badge" style={{ width: size, height: size }} title={name}>
      <img src={tierIcon(tier)} alt={name} width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} loading="lazy" decoding="async" {...fadeIn} />
    </span>
  );
}
