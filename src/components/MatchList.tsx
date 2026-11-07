import type { RecentMatch } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt, placeLabel, timeAgo } from "../lib/format";

type Props = {
  matches: RecentMatch[];
  onOpen: (matchId: string) => void;
  startIndex?: number;
};

export function MatchList({ matches, onOpen, startIndex = 0 }: Props) {
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
          <button type="button" className="track clickable" key={game.matchId} onClick={() => onOpen(game.matchId)}>
            <span className="faint">{startIndex + index + 1}</span>
            {agentIcon(game.agentId) ? <img src={agentIcon(game.agentId)} alt={game.agentName ?? ""} /> : <span />}
            <span className="stack" style={{ gap: 0 }}>
              <strong>{game.mapName ?? "Map inconnue"}</strong>
              <span className="faint" style={{ fontSize: 12 }}>
                {game.queue === "premier" ? "Premier, " : ""}
                {timeAgo(game.startedAt)}
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
