import { Fragment } from "react";
import type { Account, RecentMatch } from "../lib/api";
import { agentIcon, seasonLabel, tierIcon, tierNameById } from "../lib/assets";
import { fmt, placeLabel, signed, timeAgo } from "../lib/format";
import { t } from "../lib/i18n";
import { Art, fadeIn } from "./GameArt";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "./Skeleton";

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
        <TrackHead />
        {matches.map((game, index) => (
          <Fragment key={`${game.matchId}|${game.puuid}`}>
            {game.seasonShort && index > 0 && game.seasonShort !== matches[index - 1].seasonShort && (
              <div className="match-act" role="separator">
                <span>{seasonLabel(game.seasonShort)}</span>
              </div>
            )}
            <button type="button" className="track clickable" onClick={() => onOpen(game.matchId, game.puuid)}>
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
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function TrackHead() {
  return (
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
  );
}

export function MatchListSkeleton({ rows = 10, head = true }: { rows?: number; head?: boolean }) {
  return (
    <SkeletonGroup className="list-scroll" label={t("Chargement des matchs", "Loading matches")}>
      <div>
        {head && <TrackHead />}
        {repeat(rows, (index) => (
          <div className="track" key={index} aria-hidden="true">
            <SkeletonLine width={14} size={13} />
            <SkeletonBlock width={40} height={40} radius={6} />
            <span className="stack" style={{ gap: 4 }}>
              <SkeletonLine width={index % 3 === 0 ? "62%" : "48%"} size={14} />
              <SkeletonLine width="38%" size={12} />
            </span>
            <SkeletonLine width="72%" size={14} />
            <span className="match-rank">
              <SkeletonBlock width={28} height={28} radius="50%" />
              <SkeletonLine width={24} size={13} />
            </span>
            <SkeletonLine width="58%" size={14} />
            <SkeletonLine width={32} size={14} />
            <SkeletonLine width={28} size={14} style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

function MatchRank({ tier, change }: { tier: number | null; change: number | null }) {
  const ranked = tier !== null && tier >= 3;
  const name = ranked ? tierNameById(tier) : "";
  const tone = change === null ? "" : change > 0 ? "win" : change < 0 ? "bad" : "muted";
  return (
    <span className="match-rank">
      {ranked && <img src={tierIcon(tier)} alt={name} title={name} width={28} height={28} loading="lazy" decoding="async" {...fadeIn} />}
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
