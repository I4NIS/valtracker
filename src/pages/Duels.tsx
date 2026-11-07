import "../styles/duels.css";
import { useMemo, useState } from "react";
import { Art } from "../components/GameArt";
import { SeasonPicker } from "../components/SeasonPicker";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import type { Account } from "../lib/api";
import { agentIcon } from "../lib/assets";
import type { ClutchEntry, ClutchSize, DistanceBucket, DuelReport, Matchup, OpeningSide, Rival } from "../lib/duels";
import { fmt, fullDate, pct, roleLabel } from "../lib/format";
import { cardArt, mapArt } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { defaultSeason, queries } from "../lib/queries";
import { useViewport } from "../lib/viewport";

type Props = {
  account: Account;
  refreshKey: number;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
};

type Sort = "matches" | "rate";

const MATCHUP_PREVIEW = 12;
const MATCHUP_ROW = 44;
const CLUTCH_PAGE = 10;
const TALL_HEIGHT = 1000;
const LARGE_WIDTH = 1700;
const OPENING_ROW = 44;

const en = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type Tab = "opening" | "clutch" | "agents" | "distance" | "rivals";

const TABS = (): { id: Tab; label: string }[] => [
  { id: "opening", label: t("Ouvertures", "Openings") },
  { id: "clutch", label: t("Clutchs", "Clutches") },
  { id: "agents", label: t("Face aux agents", "Against agents") },
  { id: "distance", label: t("Distance", "Distance") },
  { id: "rivals", label: t("Rivaux", "Rivals") },
];

let rememberedTab: Tab = "opening";

export function Duels({ account, onOpenRound }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const [tab, setTab] = useState<Tab>(rememberedTab);
  const query = useQuery(season === undefined ? null : queries.duels(account.puuid, season));
  const data = query.data ?? null;
  const error = query.error;

  const pick = (next: Tab) => {
    rememberedTab = next;
    setTab(next);
  };

  return (
    <div className="content duels">
      <header className="page-head">
        <div className="page-head-title">
          <h1 className="title">Duels</h1>
          {data && data.matches > 0 && (
            <span className="faint">
              {t(
                `${fmt(data.kills)} kills et ${fmt(data.deaths)} morts sur ${fmt(data.matches)} matchs et ${fmt(data.rounds)} rounds`,
                `${fmt(data.kills)} ${data.kills === 1 ? "kill" : "kills"} and ${fmt(data.deaths)} ${data.deaths === 1 ? "death" : "deaths"} over ${fmt(data.matches)} ${data.matches === 1 ? "match" : "matches"} and ${fmt(data.rounds)} ${data.rounds === 1 ? "round" : "rounds"}`,
              )}
            </span>
          )}
        </div>
        <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />
      </header>

      {data && data.matches > 0 && (
        <div className="segmented" role="tablist" aria-label={t("Sections des duels", "Duel sections")} style={{ alignSelf: "flex-start" }}>
          {TABS().map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "active" : undefined}
              onClick={() => pick(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {error && !data && <p className="form-error">{error}</p>}

      {!data ? (
        error ? (
          <div className="empty">{t("Impossible de charger tes duels.", "Couldn't load your duels.")}</div>
        ) : (
          <DuelsSkeleton />
        )
      ) : data.matches === 0 ? (
        <div className="empty">{t("Aucun match compétitif synchronisé sur cette période.", "No competitive matches synced for this period.")}</div>
      ) : (
        <>
          {tab === "opening" && <OpeningSection data={data} puuid={account.puuid} season={season ?? null} />}
          {tab === "clutch" && <ClutchSection key={season ?? "all"} data={data} onOpenRound={onOpenRound} />}
          {tab === "agents" && <MatchupSection matchups={data.matchups} />}
          {tab === "distance" && <DistanceSection buckets={data.distances} />}
          {tab === "rivals" && <RivalSection nemeses={data.nemeses} victims={data.victims} />}
        </>
      )}
    </div>
  );
}

function DuelsSkeleton() {
  return (
    <SkeletonGroup className="stack" style={{ gap: 24 }} label={t("Chargement de tes duels", "Loading your duels")}>
      <SkeletonBlock width={430} height={36} radius={999} />
      <SkeletonLine width={200} size={19} />
      <div className="duel-opening-hero">
        <div className="row" style={{ gap: 18 }}>
          <SkeletonBlock width={104} height={104} radius="50%" />
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            <SkeletonLine width="80%" size={17} />
            <SkeletonLine width="64%" size={13} />
          </div>
        </div>
        {repeat(2, (index) => (
          <div className="duel-figure" key={index}>
            <SkeletonLine width={70} size={12} />
            <SkeletonLine width={64} size={52} lineHeight={1} />
            <SkeletonLine width="78%" size={13} />
          </div>
        ))}
      </div>
      <div className="duel-sides">
        {repeat(2, (index) => (
          <div className="panel stack" style={{ gap: 16 }} key={index}>
            <div className="row between" style={{ alignItems: "center" }}>
              <SkeletonLine width={96} size={17} />
              <SkeletonLine width={52} size={26} />
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <SkeletonBlock height={10} radius={999} />
              <div className="row between">
                <SkeletonLine width={90} size={13} />
                <SkeletonLine width={90} size={13} />
              </div>
            </div>
            <div className="duel-facts">
              {repeat(2, (fact) => (
                <div className="stack" style={{ gap: 4 }} key={fact}>
                  <SkeletonLine width="80%" size={12} />
                  <SkeletonLine width={48} size={17} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="row between wrap" style={{ alignItems: "baseline" }}>
      <h2 className="section-title">{title}</h2>
      {note && <span className="faint" style={{ fontSize: 13 }}>{note}</span>}
    </div>
  );
}

function Ring({ value, size = 72, tone = "good", label, empty }: { value: number; size?: number; tone?: "good" | "bad" | "win" | "gold"; label: string; empty?: boolean }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const share = empty ? 0 : Math.min(Math.max(value, 0), 100) / 100;
  return (
    <div className="duel-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" role="img" aria-label={label}>
        <circle cx="50" cy="50" r={radius} className="duel-ring-track" />
        {share > 0 && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            className={`duel-ring-fill is-${tone}`}
            strokeDasharray={`${share * circumference} ${circumference}`}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <span className="duel-ring-value" aria-hidden="true" style={{ fontSize: Math.round(size * 0.24) }}>
        {empty ? "0" : fmt(value, 0)}
        <small>%</small>
      </span>
    </div>
  );
}

function Split({ kills, deaths, label }: { kills: number; deaths: number; label: string }) {
  const total = kills + deaths;
  const share = total > 0 ? (kills / total) * 100 : 0;
  return (
    <div className="duel-split" role="img" aria-label={label}>
      {total === 0 ? (
        <span className="duel-split-empty" />
      ) : (
        <>
          {kills > 0 && <span className="duel-split-win" style={{ width: `${share}%` }} />}
          {deaths > 0 && <span className="duel-split-loss" style={{ width: `${100 - share}%` }} />}
        </>
      )}
      <i className="duel-split-mid" aria-hidden="true" />
    </div>
  );
}

function OpeningSection({ data, puuid, season }: { data: DuelReport; puuid: string; season: string | null }) {
  const height = useViewport().height;
  const all = data.opening.all;
  const involved = all.firstKills + all.firstDeaths;
  return (
    <section className="stack" style={{ gap: 24 }}>
      <SectionHead
        title={t("Duels d'ouverture", "Opening duels")}
        note={
          all.rounds > 0
            ? t(
                `Impliqué dans le premier kill de ${pct((involved * 100) / all.rounds, 0)} des rounds`,
                `Involved in the first kill of ${pct((involved * 100) / all.rounds, 0)} of rounds`,
              )
            : undefined
        }
      />
      {involved === 0 ? (
        <div className="empty">{t("Aucun premier kill ni première mort sur cette période.", "No first kills or first deaths in this period.")}</div>
      ) : (
        <>
          <div className="duel-opening-hero">
            <div className="row" style={{ gap: 18 }}>
              <Ring value={all.successRate} size={104} label={t(`${pct(all.successRate, 0)} de duels d'ouverture gagnés`, `${pct(all.successRate, 0)} of opening duels won`)} />
              <div className="stack" style={{ gap: 4 }}>
                <strong style={{ fontSize: 17 }}>{t("Duels d'ouverture gagnés", "Opening duels won")}</strong>
                <span className="hint">
                  {t(`${all.firstKills} gagnés sur ${involved} duels d'ouverture.`, `${all.firstKills} won out of ${en(involved, "opening duel", "opening duels")}.`)}
                </span>
              </div>
            </div>
            <div className="duel-figure">
              <span className="label">First kills</span>
              <span className="big-number good">{fmt(all.firstKills)}</span>
              <span className="hint">{t(`Round gagné ensuite dans ${pct(all.winRateAfterKill, 0)} des cas`, `Round won afterwards ${pct(all.winRateAfterKill, 0)} of the time`)}</span>
            </div>
            <div className="duel-figure">
              <span className="label">First deaths</span>
              <span className="big-number bad">{fmt(all.firstDeaths)}</span>
              <span className="hint">{t(`Round gagné ensuite dans ${pct(all.winRateAfterDeath, 0)} des cas`, `Round won afterwards ${pct(all.winRateAfterDeath, 0)} of the time`)}</span>
            </div>
          </div>
          <div className="duel-sides">
            <OpeningCard title={t("En attaque", "On attack")} side={data.opening.attack} />
            <OpeningCard title={t("En défense", "On defense")} side={data.opening.defense} />
          </div>
          {height >= TALL_HEIGHT && <OpeningsByAgent puuid={puuid} season={season} rows={Math.floor((height - 800) / OPENING_ROW)} />}
        </>
      )}
    </section>
  );
}

function OpeningCard({ title, side }: { title: string; side: OpeningSide }) {
  const involved = side.firstKills + side.firstDeaths;
  return (
    <div className="panel stack" style={{ gap: 16 }}>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <strong style={{ fontSize: 17 }}>{title}</strong>
        <span className="duel-side-rate">{involved > 0 ? pct(side.successRate, 0) : t("Aucun", "None")}</span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <Split
          kills={side.firstKills}
          deaths={side.firstDeaths}
          label={t(`${side.firstKills} first kills et ${side.firstDeaths} first deaths`, `${side.firstKills} first kills and ${side.firstDeaths} first deaths`)}
        />
        <div className="row between" style={{ fontSize: 13 }}>
          <span className="good">
            <strong>{side.firstKills}</strong> first kills
          </span>
          <span className="bad">
            <strong>{side.firstDeaths}</strong> first deaths
          </span>
        </div>
      </div>
      <div className="duel-facts">
        <div>
          <span className="label">{t("Round gagné après first kill", "Round won after first kill")}</span>
          <strong>{side.firstKills > 0 ? pct(side.winRateAfterKill, 0) : t("Pas de données", "No data")}</strong>
          <span className="faint">{t(`${side.wonAfterKill} sur ${side.firstKills}`, `${side.wonAfterKill} of ${side.firstKills}`)}</span>
        </div>
        <div>
          <span className="label">{t("Round gagné après first death", "Round won after first death")}</span>
          <strong>{side.firstDeaths > 0 ? pct(side.winRateAfterDeath, 0) : t("Pas de données", "No data")}</strong>
          <span className="faint">{t(`${side.wonAfterDeath} sur ${side.firstDeaths}`, `${side.wonAfterDeath} of ${side.firstDeaths}`)}</span>
        </div>
      </div>
      <span className="faint" style={{ fontSize: 12 }}>
        {t(`${side.rounds} round${side.rounds > 1 ? "s" : ""} joué${side.rounds > 1 ? "s" : ""} de ce côté`, `${en(side.rounds, "round", "rounds")} played on this side`)}
      </span>
    </div>
  );
}

function ClutchSection({ data, onOpenRound }: { data: DuelReport; onOpenRound?: (matchId: string, roundIndex: number) => void }) {
  const clutches = data.clutches;
  const [filter, setFilter] = useState<number | null>(null);
  const [visible, setVisible] = useState(CLUTCH_PAGE);
  const list = useMemo(
    () => (filter === null ? clutches.recent : clutches.recent.filter((entry) => entry.enemies === filter)),
    [clutches.recent, filter],
  );
  const shown = list.slice(0, visible);
  const capped = filter === null ? clutches.attempts > clutches.recent.length : false;

  const choose = (enemies: number) => {
    setFilter((current) => (current === enemies ? null : enemies));
    setVisible(CLUTCH_PAGE);
  };

  return (
    <section className="stack" style={{ gap: 24 }}>
      <SectionHead
        title={t("Clutchs", "Clutches")}
        note={
          clutches.attempts > 0
            ? t(
                `${clutches.won} gagnés sur ${clutches.attempts} situations, ${pct(clutches.winRate, 0)}`,
                `${clutches.won} won out of ${en(clutches.attempts, "situation", "situations")}, ${pct(clutches.winRate, 0)}`,
              )
            : undefined
        }
      />
      {clutches.attempts === 0 ? (
        <div className="empty">
          {t("Tu n'as jamais été le dernier en vie de ton équipe sur cette période.", "You were never the last one alive on your team in this period.")}
        </div>
      ) : (
        <>
          <div className="duel-clutch-grid" role="group" aria-label={t("Filtrer par situation", "Filter by situation")}>
            {clutches.bySize.map((size) => (
              <ClutchTile key={size.enemies} size={size} active={filter === size.enemies} onToggle={() => choose(size.enemies)} />
            ))}
          </div>
          {clutches.recent.length > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row between wrap" style={{ alignItems: "baseline" }}>
                <h3 className="duel-subtitle">{filter === null ? t("Toutes les situations", "All situations") : t(`Situations en 1v${filter}`, `1v${filter} situations`)}</h3>
                <span className="faint" style={{ fontSize: 13 }}>
                  {t(`${list.length} ${list.length > 1 ? "situations" : "situation"}`, en(list.length, "situation", "situations"))}
                  {capped ? t(`, les ${clutches.recent.length} plus récentes`, `, the ${clutches.recent.length} most recent`) : ""}
                  {filter !== null && (
                    <>
                      {", "}
                      <button type="button" className="duel-link" onClick={() => setFilter(null)}>
                        {t("tout afficher", "show all")}
                      </button>
                    </>
                  )}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  {t(`Aucune situation en 1v${filter} sur cette période.`, `No 1v${filter} situations in this period.`)}
                </p>
              ) : (
                <ul className="duel-list">
                  {shown.map((entry) => (
                    <ClutchRow key={`${entry.matchId}-${entry.roundIndex}`} entry={entry} onOpenRound={onOpenRound} />
                  ))}
                </ul>
              )}
              {list.length > visible && (
                <button type="button" className="btn btn-secondary duel-more" onClick={() => setVisible((count) => count + CLUTCH_PAGE)}>
                  {t("Afficher plus", "Show more")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ClutchTile({ size, active, onToggle }: { size: ClutchSize; active: boolean; onToggle: () => void }) {
  const ringSize = useViewport().width >= LARGE_WIDTH ? 104 : 76;
  const empty = size.attempts === 0;
  return (
    <button
      type="button"
      className={`duel-clutch${empty ? " is-empty" : ""}${active ? " active" : ""}`}
      onClick={onToggle}
      disabled={empty}
      aria-pressed={active}
    >
      <span className="duel-clutch-name">1v{size.enemies}</span>
      <Ring
        value={size.winRate}
        size={ringSize}
        tone="win"
        empty={empty}
        label={
          empty
            ? t(`Aucune situation en 1v${size.enemies}`, `No 1v${size.enemies} situations`)
            : t(`1v${size.enemies} : ${size.won} gagnés sur ${size.attempts}, ${pct(size.winRate, 0)}`, `1v${size.enemies}: ${size.won} won out of ${size.attempts}, ${pct(size.winRate, 0)}`)
        }
      />
      <span className="duel-clutch-count">
        <strong>{size.won}</strong>
        <span className="faint"> / {size.attempts}</span>
      </span>
      <span className="faint" style={{ fontSize: 12 }}>
        {empty ? t("aucune situation", "no situations") : t(size.won > 1 ? "gagnés" : "gagné", "won")}
      </span>
    </button>
  );
}

function ClutchRow({ entry, onOpenRound }: { entry: ClutchEntry; onOpenRound?: (matchId: string, roundIndex: number) => void }) {
  const body = (
    <>
      <span className="duel-clutch-map">
        <Art src={mapArt(entry.mapId, "listviewicon")} width={112} height={44} alt="" className="duel-clutch-map-art" />
        <Art src={agentIcon(entry.agentId)} width={32} height={32} alt="" className="duel-clutch-agent" />
      </span>
      <div className="stack duel-grow" style={{ gap: 2 }}>
        <strong className="ellipsis">
          {entry.mapName ?? t("Map inconnue", "Unknown map")}, round {entry.round}
        </strong>
        <span className="faint ellipsis" style={{ fontSize: 12 }}>
          {t(
            `${fullDate(entry.startedAt)}, ${entry.kills} ${entry.kills > 1 ? "kills" : "kill"} dans le round`,
            `${fullDate(entry.startedAt)}, ${en(entry.kills, "kill", "kills")} in the round`,
          )}
        </span>
      </div>
      <span className="duel-pill">1v{entry.enemies}</span>
      <span className={`duel-result ${entry.won ? "is-win" : "is-loss"}`}>{entry.won ? t("Gagné", "Won") : t("Perdu", "Lost")}</span>
    </>
  );
  return (
    <li>
      {onOpenRound ? (
        <button
          type="button"
          className="duel-list-row duel-clutch-row"
          onClick={() => onOpenRound(entry.matchId, entry.roundIndex)}
          aria-label={t(
            `Ouvrir le round ${entry.round} sur ${entry.mapName ?? "une map inconnue"}, 1v${entry.enemies} ${entry.won ? "gagné" : "perdu"}`,
            `Open round ${entry.round} on ${entry.mapName ?? "an unknown map"}, 1v${entry.enemies} ${entry.won ? "won" : "lost"}`,
          )}
        >
          {body}
        </button>
      ) : (
        <div className="duel-list-row duel-clutch-row">{body}</div>
      )}
    </li>
  );
}

function MatchupSection({ matchups }: { matchups: Matchup[] }) {
  const [sort, setSort] = useState<Sort>("matches");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => {
    const list = [...matchups];
    if (sort === "rate") {
      list.sort((a, b) => b.winRate - a.winRate || b.kills + b.deaths - (a.kills + a.deaths));
    } else {
      list.sort((a, b) => b.matches - a.matches || a.agentName.localeCompare(b.agentName));
    }
    return list;
  }, [matchups, sort]);
  const height = useViewport().height;
  const preview = Math.max(MATCHUP_PREVIEW, Math.floor((height - 360) / MATCHUP_ROW));
  const shown = expanded ? sorted : sorted.slice(0, preview);

  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ alignItems: "center" }}>
        <h2 className="section-title">{t("Face à chaque agent", "Against each agent")}</h2>
        <div className="row wrap" style={{ gap: 8 }}>
          {sorted.length > preview && (
            <button type="button" className="chip" onClick={() => setExpanded((value) => !value)}>
              {expanded ? t("Afficher moins", "Show less") : t(`Afficher les ${sorted.length} agents`, `Show all ${sorted.length} agents`)}
            </button>
          )}
          {matchups.length > 1 && (
            <div className="segmented" role="group" aria-label={t("Trier par", "Sort by")}>
              <button type="button" className={sort === "matches" ? "active" : ""} onClick={() => setSort("matches")}>
                {t("Rencontres", "Encounters")}
              </button>
              <button type="button" className={sort === "rate" ? "active" : ""} onClick={() => setSort("rate")}>
                {t("Duels gagnés", "Duels won")}
              </button>
            </div>
          )}
        </div>
      </div>
      {matchups.length === 0 ? (
        <div className="empty">{t("Aucun agent ennemi rencontré sur cette période.", "No enemy agents faced in this period.")}</div>
      ) : (
        <div className="duel-table">
          <div className="duel-matchup head" aria-hidden="true">
            <span />
            <span>Agent</span>
            <span className="duel-num">{t("Matchs", "Matches")}</span>
            <span className="duel-num duel-kd">{t("Kills / morts", "Kills / deaths")}</span>
            <span>{t("Duels gagnés", "Duels won")}</span>
          </div>
          {shown.map((matchup) => (
            <MatchupRow key={matchup.agentId} matchup={matchup} />
          ))}
        </div>
      )}
    </section>
  );
}

function OpeningsByAgent({ puuid, season, rows }: { puuid: string; season: string | null; rows: number }) {
  const agents = useQuery(queries.agents(puuid, season)).data ?? null;
  const list = useMemo(
    () =>
      (agents ?? [])
        .filter((agent) => agent.firstBloods + agent.firstDeaths > 0)
        .sort((a, b) => b.firstBloods + b.firstDeaths - (a.firstBloods + a.firstDeaths))
        .slice(0, Math.max(0, rows)),
    [agents, rows],
  );
  if (rows < 2 || list.length === 0) return null;
  return (
    <section className="stack" style={{ gap: 12 }}>
      <SectionHead title={t("Ouvertures par agent joué", "Openings by agent played")} note={t("Agents triés par nombre de duels d'ouverture", "Agents sorted by opening duels")} />
      <div className="duel-table">
        <div className="duel-matchup head" aria-hidden="true">
          <span />
          <span>Agent</span>
          <span className="duel-num">{t("Matchs", "Matches")}</span>
          <span className="duel-num duel-kd">{t("FK / FD", "FK / FD")}</span>
          <span>{t("Duels d'ouverture gagnés", "Opening duels won")}</span>
        </div>
        {list.map((agent) => {
          const total = agent.firstBloods + agent.firstDeaths;
          const rate = (agent.firstBloods * 100) / total;
          return (
            <div className="duel-matchup" key={agent.agentId}>
              <Art src={agentIcon(agent.agentId)} width={36} height={36} alt={agent.name} className="duel-agent" />
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong className="ellipsis">{agent.name}</strong>
                <span className="faint ellipsis" style={{ fontSize: 12 }}>
                  {roleLabel(agent.role) || "Agent"}
                </span>
              </div>
              <span className="duel-num">{agent.matches}</span>
              <span className="duel-num duel-kd">
                <span className="good">{agent.firstBloods}</span>
                <span className="faint"> / </span>
                <span className="bad">{agent.firstDeaths}</span>
              </span>
              <div className="duel-rate">
                <Split
                  kills={agent.firstBloods}
                  deaths={agent.firstDeaths}
                  label={t(`${agent.firstBloods} first kills et ${agent.firstDeaths} first deaths`, `${agent.firstBloods} first kills and ${agent.firstDeaths} first deaths`)}
                />
                <strong className={rate >= 50 ? "good" : "bad"}>{pct(rate, 0)}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MatchupRow({ matchup }: { matchup: Matchup }) {
  const duels = matchup.kills + matchup.deaths;
  return (
    <div className="duel-matchup">
      <Art src={agentIcon(matchup.agentId)} width={36} height={36} alt={matchup.agentName} className="duel-agent" />
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <strong className="ellipsis">{matchup.agentName}</strong>
        <span className="faint ellipsis" style={{ fontSize: 12 }}>
          {roleLabel(matchup.role) || "Agent"}
        </span>
      </div>
      <span className="duel-num">{matchup.matches}</span>
      <span className="duel-num duel-kd">
        <span className="good">{matchup.kills}</span>
        <span className="faint"> / </span>
        <span className="bad">{matchup.deaths}</span>
      </span>
      <div className="duel-rate">
        <Split
          kills={matchup.kills}
          deaths={matchup.deaths}
          label={t(
            `Contre ${matchup.agentName} : ${matchup.kills} kills, ${matchup.deaths} morts`,
            `Against ${matchup.agentName}: ${en(matchup.kills, "kill", "kills")}, ${en(matchup.deaths, "death", "deaths")}`,
          )}
        />
        <strong className={duels === 0 ? "faint" : matchup.winRate >= 50 ? "good" : "bad"}>{duels === 0 ? t("0 duel", "0 duels") : pct(matchup.winRate, 0)}</strong>
      </div>
    </div>
  );
}

function DistanceSection({ buckets }: { buckets: DistanceBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.kills + bucket.deaths, 0);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.kills + bucket.deaths));
  return (
    <section className="stack" style={{ gap: 20 }}>
      <SectionHead
        title={t("Distance des duels", "Duel distance")}
        note={total > 0 ? t(`${fmt(total)} duels avec positions connues`, `${fmt(total)} ${total === 1 ? "duel" : "duels"} with known positions`) : undefined}
      />
      {total === 0 ? (
        <div className="empty">
          {t("Pas assez de positions enregistrées pour mesurer la distance de tes duels.", "Not enough positions recorded to measure your duel distance.")}
        </div>
      ) : (
        <div className="duel-distances">
          {buckets.map((bucket) => {
            const count = bucket.kills + bucket.deaths;
            return (
              <div className="duel-distance" key={bucket.key}>
                <div className="stack" style={{ gap: 2 }}>
                  <strong style={{ fontSize: 15 }}>{bucket.label}</strong>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {t(`${pct((count * 100) / total, 0)} de tes duels`, `${pct((count * 100) / total, 0)} of your duels`)}
                  </span>
                </div>
                <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                  <div style={{ width: `${Math.max((count / max) * 100, 8)}%` }}>
                    <Split kills={bucket.kills} deaths={bucket.deaths} label={t(`${bucket.label} : ${fmt(bucket.kills)} gagnés, ${fmt(bucket.deaths)} perdus`, `${bucket.label}: ${fmt(bucket.kills)} won, ${fmt(bucket.deaths)} lost`)} />
                  </div>
                  <span style={{ fontSize: 13 }}>
                    <span className="good">{t(`${fmt(bucket.kills)} gagnés`, `${fmt(bucket.kills)} won`)}</span>
                    <span className="faint">, </span>
                    <span className="bad">{t(`${fmt(bucket.deaths)} perdus`, `${fmt(bucket.deaths)} lost`)}</span>
                  </span>
                </div>
                <span className={`duel-distance-rate ${count === 0 ? "faint" : bucket.winRate >= 50 ? "good" : "bad"}`}>
                  {count === 0 ? "0" : pct(bucket.winRate, 0)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RivalSection({ nemeses, victims }: { nemeses: Rival[]; victims: Rival[] }) {
  return (
    <section className="stack" style={{ gap: 20 }}>
      <SectionHead title={t("Rivaux", "Rivals")} note={t("Joueurs ennemis, au moins 3 kills", "Enemy players, at least 3 kills")} />
      <div className="duel-rivals">
        <RivalList
          title={t("Ils te tuent le plus", "They kill you the most")}
          rivals={nemeses}
          tone="bad"
          main={(rival) => rival.killedMe}
          other={(rival) => t(`tu l'as tué ${rival.killedByMe} fois`, `you killed them ${en(rival.killedByMe, "time", "times")}`)}
          empty={t("Aucun joueur ne t'a tué au moins 3 fois sur cette période.", "No player killed you at least 3 times in this period.")}
        />
        <RivalList
          title={t("Tes victimes favorites", "Your favorite victims")}
          rivals={victims}
          tone="good"
          main={(rival) => rival.killedByMe}
          other={(rival) => t(`il t'a tué ${rival.killedMe} fois`, `they killed you ${en(rival.killedMe, "time", "times")}`)}
          empty={t("Tu n'as tué aucun joueur au moins 3 fois sur cette période.", "You didn't kill any player at least 3 times in this period.")}
        />
      </div>
    </section>
  );
}

function RivalFace({ rival }: { rival: Rival }) {
  const agent = <Art src={agentIcon(rival.agentId)} width={40} height={40} alt="" className="duel-agent" />;
  return (
    <span className="duel-rival-face">
      {rival.card ? (
        <>
          <Art src={cardArt(rival.card)} width={40} height={40} alt="" className="duel-rival-card" fallback={agent} />
          <Art src={agentIcon(rival.agentId)} width={20} height={20} alt="" className="duel-rival-badge" />
        </>
      ) : (
        agent
      )}
    </span>
  );
}

function RivalList({
  title,
  rivals,
  tone,
  main,
  other,
  empty,
}: {
  title: string;
  rivals: Rival[];
  tone: "good" | "bad";
  main: (rival: Rival) => number;
  other: (rival: Rival) => string;
  empty: string;
}) {
  return (
    <div className="panel stack" style={{ gap: 12 }}>
      <h3 className="duel-subtitle">{title}</h3>
      {rivals.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {empty}
        </p>
      ) : (
        <ul className="duel-list">
          {rivals.map((rival) => (
            <li className="duel-list-row" key={rival.puuid}>
              <RivalFace rival={rival} />
              <div className="stack duel-grow" style={{ gap: 2 }}>
                <span className="ellipsis">
                  <strong>{rival.name || t("Inconnu", "Unknown")}</strong>
                  {rival.tag && <span className="faint">#{rival.tag}</span>}
                </span>
                <span className="faint ellipsis" style={{ fontSize: 12 }}>
                  {other(rival)}, {t(`${rival.matches} ${rival.matches > 1 ? "matchs" : "match"}`, en(rival.matches, "match", "matches"))}
                </span>
              </div>
              <span className={`duel-rival-count ${tone}`}>
                {main(rival)}
                <small> {t("kills", main(rival) === 1 ? "kill" : "kills")}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
