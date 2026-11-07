import type { Account, RecentMatch } from "../lib/api";
import { agentIcon, tierIcon, tierNameById } from "../lib/assets";
import { fmt, placeLabel, signed, timeAgo } from "../lib/format";
import { t } from "../lib/i18n";
import { Art } from "./GameArt";

type Props = {
  matches: RecentMatch[];
  onOpen: (matchId: string, puuid: string) => void;
  startIndex?: number;
  accounts?: Account[] | null;
};

export function MatchList({ matches, onOpen, startIndex = 0, accounts }: Props) {
  return (
    <div className="list-scroll">
      <div>
        <div className="track head">
          <span>#</span>
          <span />
          <span>{t("Map", "Map")}</span>
          <span>{t("Résultat", "Result")}</span>
          <span>{t("Rang", "Rank")}</span>
          <span>K / D / A</span>
          <span>ACS</span>
          <span style={{ textAlign: "right" }}>{t("Place", "Place")}</span>
        </div>
        {matches.map((game, index) => (
          <button type="button" className="track clickable" key={`${game.matchId}|${game.puuid}`} onClick={() => onOpen(game.matchId, game.puuid)}>
            <span className="faint">{startIndex + index + 1}</span>
            <Art src={agentIcon(game.agentId)} width={40} height={40} alt={game.agentName ?? ""} />
            <span className="stack" style={{ gap: 0 }}>
              <strong>{game.mapName ?? t("Map inconnue", "Unknown map")}</strong>
              <span className="faint" style={{ fontSize: 12 }}>
                {accounts ? `${accountName(accounts, game.puuid)}, ${timeAgo(game.startedAt)}` : timeAgo(game.startedAt)}
              </span>
            </span>
            <strong className={game.won ? "win" : "bad"}>
              {game.won ? t("Victoire", "Victory") : t("Défaite", "Defeat")} {game.roundsWon}-{game.roundsLost}
            </strong>
            <MatchRank tier={game.tier} change={game.rrChange} />
            <span className="muted">
              {game.kills} / {game.deaths} / {game.assists}
            </span>
            <span className="muted">{fmt(game.acs)}</span>
            <strong style={{ textAlign: "right" }}>{placeLabel(game.place)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchRank({ tier, change }: { tier: number | null; change: number | null }) {
  const ranked = tier !== null && tier >= 3;
  const name = ranked ? tierNameById(tier) : "";
  const tone = change === null ? "" : change > 0 ? "win" : change < 0 ? "bad" : "muted";
  return (
    <span className="match-rank">
      {ranked && <img src={tierIcon(tier)} alt={name} title={name} />}
      {change !== null && (
        <strong className={tone} title={t(`${signed(change)} RR sur ce match`, `${signed(change)} RR on this match`)}>
          {signed(change)}
        </strong>
      )}
    </span>
  );
}

function accountName(accounts: Account[], puuid: string): string {
  return accounts.find((account) => account.puuid === puuid)?.name ?? t("Autre compte", "Other account");
}
