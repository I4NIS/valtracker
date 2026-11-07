import type { Account, RecentMatch } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt, placeLabel, timeAgo } from "../lib/format";
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
          <span>Map</span>
          <span>Résultat</span>
          <span>K / D / A</span>
          <span>ACS</span>
          <span style={{ textAlign: "right" }}>Place</span>
        </div>
        {matches.map((game, index) => (
          <button type="button" className="track clickable" key={`${game.matchId}|${game.puuid}`} onClick={() => onOpen(game.matchId, game.puuid)}>
            <span className="faint">{startIndex + index + 1}</span>
            <Art src={agentIcon(game.agentId)} width={40} height={40} alt={game.agentName ?? ""} />
            <span className="stack" style={{ gap: 0 }}>
              <strong>{game.mapName ?? "Map inconnue"}</strong>
              <span className="faint" style={{ fontSize: 12 }}>
                {accounts ? `${accountName(accounts, game.puuid)}, ${timeAgo(game.startedAt)}` : timeAgo(game.startedAt)}
              </span>
            </span>
            <strong className={game.won ? "win" : "bad"}>
              {game.won ? "Victoire" : "Défaite"} {game.roundsWon}-{game.roundsLost}
            </strong>
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

function accountName(accounts: Account[], puuid: string): string {
  return accounts.find((account) => account.puuid === puuid)?.name ?? "Autre compte";
}
