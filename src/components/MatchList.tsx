import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import type { Account, RecentMatch } from "../lib/api";
import { agentIcon, seasonLabel, tierIcon, tierNameById } from "../lib/assets";
import { fmt, pct, placeLabel, signed, timeAgo } from "../lib/format";
import { t } from "../lib/i18n";
import { useSort, type Sort, type SortColumns, type Sorter } from "../lib/sort";
import { Art, fadeIn } from "./GameArt";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "./Skeleton";
import { SortHeader } from "./SortHeader";

type Props = {
  matches: RecentMatch[];
  onOpen: (matchId: string, puuid: string) => void;
  startIndex?: number;
  accounts?: Account[] | null;
  sortId?: string;
};

type Row = { game: RecentMatch; index: number };

const COLUMNS: SortColumns<Row> = {
  index: { value: (row) => row.index, first: "asc" },
  map: { value: (row) => row.game.mapName },
  result: { value: ({ game }) => (game.won ? 100 : -100) + game.roundsWon - game.roundsLost },
  rank: { value: ({ game }) => game.rrChange },
  kda: { value: ({ game }) => game.kills / Math.max(1, game.deaths) },
  hs: { value: ({ game }) => game.hsPct },
  adr: { value: ({ game }) => game.adr },
  acs: { value: ({ game }) => game.acs },
  place: { value: ({ game }) => game.place, first: "asc" },
};

const CHRONO: Sort = { key: "index", dir: "asc" };

export function MatchList({ matches, onOpen, startIndex = 0, accounts, sortId = "matches" }: Props) {
  const rows = useMemo(() => matches.map((game, index) => ({ game, index })), [matches]);
  const table = useSort(sortId, rows, COLUMNS, CHRONO);
  return (
    <div className="list-scroll">
      <div>
        <TrackHead table={table} />
        {table.rows.map(({ game, index }) => (
          <Fragment key={`${game.matchId}|${game.puuid}`}>
            {table.isDefault && game.seasonShort && index > 0 && game.seasonShort !== matches[index - 1].seasonShort && (
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
              <strong>{pct(game.hsPct, 0)}</strong>
              <span className="muted">{fmt(game.adr)}</span>
              <span className="muted">{fmt(game.acs)}</span>
              <strong style={{ textAlign: "right" }}>{placeLabel(game.place)}</strong>
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function TrackHead({ table }: { table?: Sorter }) {
  const cell = (column: string, label: ReactNode, style?: CSSProperties) =>
    table ? (
      <SortHeader table={table} column={column} style={style}>
        {label}
      </SortHeader>
    ) : (
      <span style={style}>{label}</span>
    );
  return (
    <div className="track head">
      {cell("index", "#")}
      <span />
      {cell("map", t("Map", "Map"))}
      {cell("result", t("Résultat", "Result"))}
      {cell("rank", t("Rang", "Rank"))}
      {cell("kda", "K / D / A")}
      {cell("hs", "HS")}
      {cell("adr", "ADR")}
      {cell("acs", "ACS")}
      {cell("place", t("Place", "Place"), { textAlign: "right" })}
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
            <SkeletonLine width={30} size={14} />
            <SkeletonLine width={30} size={14} />
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
