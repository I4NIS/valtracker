import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Art } from "../components/GameArt";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import type { GameSummary } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, pct, signed } from "../lib/format";
import { mapArt, useAgentCatalog } from "../lib/gameAssets";
import type { MapStat } from "../lib/mapStats";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";

const SLOT_HOURS = 3;
const SLOTS = 24 / SLOT_HOURS;
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
const SESSION_BUCKETS = 5;
const TALL_VIEWPORT = 1200;

function useRowLimit() {
  const read = () => (window.innerHeight >= TALL_VIEWPORT ? 7 : 4);
  const [limit, setLimit] = useState(read);
  useEffect(() => {
    const update = () => setLimit(read());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return limit;
}

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const winRate = (games: GameSummary[]) => (games.length ? (games.filter((game) => game.won).length * 100) / games.length : 0);
const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

const DAYS = () =>
  t("Lundi,Mardi,Mercredi,Jeudi,Vendredi,Samedi,Dimanche", "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday").split(",");

type Cell = { games: GameSummary[] };

function heatGrid(games: GameSummary[]) {
  const cells: Cell[][] = Array.from({ length: 7 }, () => Array.from({ length: SLOTS }, () => ({ games: [] })));
  games.forEach((game) => {
    const date = new Date(game.startedAt);
    const day = (date.getDay() + 6) % 7;
    cells[day][Math.floor(date.getHours() / SLOT_HOURS)].games.push(game);
  });
  const days = cells.map((row) => row.flatMap((cell) => cell.games));
  const slots = Array.from({ length: SLOTS }, (_, slot) => cells.flatMap((row) => row[slot].games));
  return { cells, days, slots };
}

function sessionsOf(games: GameSummary[]) {
  const sessions: GameSummary[][] = [];
  let last = 0;
  games.forEach((game) => {
    const start = new Date(game.startedAt).getTime();
    const end = start + (game.lengthMs ?? 0);
    if (sessions.length === 0 || start - last > SESSION_GAP_MS) sessions.push([]);
    sessions[sessions.length - 1].push(game);
    last = Math.max(end, start);
  });
  const buckets = Array.from({ length: SESSION_BUCKETS }, () => [] as GameSummary[]);
  sessions.forEach((session) => session.forEach((game, index) => buckets[Math.min(index, SESSION_BUCKETS - 1)].push(game)));
  return { sessions, buckets };
}

function streaksOf(games: GameSummary[]) {
  let bestWin = 0;
  let bestLoss = 0;
  let run = 0;
  let runWon: boolean | null = null;
  games.forEach((game) => {
    run = runWon === game.won ? run + 1 : 1;
    runWon = game.won;
    if (game.won) bestWin = Math.max(bestWin, run);
    else bestLoss = Math.max(bestLoss, run);
  });
  const afterLoss = games.slice(1).filter((_, index) => !games[index].won);
  const afterWin = games.slice(1).filter((_, index) => games[index].won);
  return { bestWin, bestLoss, current: run, currentWon: runWon, afterLoss, afterWin };
}

function slotLabel(slot: number) {
  return `${slot * SLOT_HOURS}h`;
}

function heatStyle(games: GameSummary[]): CSSProperties | undefined {
  if (games.length === 0) return undefined;
  const rate = winRate(games);
  const strength = Math.min(1, Math.abs(rate - 50) / 50);
  const weight = Math.min(1, 0.45 + games.length / 8);
  const mix = Math.round((18 + strength * 62) * weight);
  const tone = rate >= 50 ? "var(--win)" : "var(--bad)";
  return { background: `color-mix(in srgb, ${tone} ${mix}%, var(--field))` };
}

function cellTitle(day: string, slot: number | null, games: GameSummary[]) {
  const when = slot === null ? day : `${day} ${slotLabel(slot)}-${slotLabel(slot + 1)}`;
  if (games.length === 0) return t(`${when} : aucun match`, `${when}: no matches`);
  return t(
    `${when} : ${matchCount(games.length)}, ${pct(winRate(games), 0)} de victoires, ${fmt(average(games.map((game) => game.acs)))} d'ACS`,
    `${when}: ${matchCount(games.length)}, ${pct(winRate(games), 0)} win rate, ${fmt(average(games.map((game) => game.acs)))} ACS`,
  );
}

export function Habits({ games }: { games: GameSummary[] }) {
  const grid = useMemo(() => heatGrid(games), [games]);
  const session = useMemo(() => sessionsOf(games), [games]);
  const streaks = useMemo(() => streaksOf(games), [games]);
  const days = DAYS();
  const perSession = session.sessions.length ? games.length / session.sessions.length : 0;

  return (
    <div className="habits">
      <section className="panel habit-panel">
        <div className="section-head">
          <h2 className="section-title">{t("Quand tu joues", "When you play")}</h2>
          <span className="faint">{t("Victoires par jour et par tranche de 3 heures", "Win rate by day and 3 hour slot")}</span>
        </div>
        <div className="heat-grid" role="table" aria-label={t("Taux de victoire par jour et par heure", "Win rate by day and hour")}>
          <span role="columnheader" />
          {repeat(SLOTS, (slot) => (
            <span key={slot} role="columnheader" className="heat-head">
              {slotLabel(slot)}
            </span>
          ))}
          <span role="columnheader" className="heat-head heat-total-head">
            {t("Total", "Total")}
          </span>
          {grid.cells.map((row, day) => (
            <div key={day} role="row" className="heat-row">
              <span role="rowheader" className="heat-day">
                {days[day].slice(0, 3)}
              </span>
              {row.map((cell, slot) => (
                <span key={slot} role="cell" className={`heat-cell${cell.games.length ? "" : " none"}`} style={heatStyle(cell.games)} title={cellTitle(days[day], slot, cell.games)}>
                  {cell.games.length > 0 && <strong>{fmt(winRate(cell.games))}</strong>}
                  {cell.games.length > 0 && <small>{cell.games.length}</small>}
                </span>
              ))}
              <span role="cell" className="heat-total" title={cellTitle(days[day], null, grid.days[day])}>
                {grid.days[day].length ? (
                  <>
                    <strong className={winRate(grid.days[day]) >= 50 ? "win" : "bad"}>{pct(winRate(grid.days[day]), 0)}</strong>
                    <small>{matchCount(grid.days[day].length)}</small>
                  </>
                ) : (
                  <small>-</small>
                )}
              </span>
            </div>
          ))}
          <span />
          {grid.slots.map((slotGames, slot) => (
            <span key={slot} className="heat-total heat-foot" title={cellTitle(t("Tous les jours", "Every day"), slot, slotGames)}>
              {slotGames.length ? (
                <>
                  <strong className={winRate(slotGames) >= 50 ? "win" : "bad"}>{pct(winRate(slotGames), 0)}</strong>
                  <small>{slotGames.length}</small>
                </>
              ) : (
                <small>-</small>
              )}
            </span>
          ))}
          <span />
        </div>
      </section>

      <section className="panel habit-panel">
        <div className="section-head">
          <h2 className="section-title">{t("Au fil d'une session", "Through a session")}</h2>
          <span className="faint">
            {t(
              `${session.sessions.length} sessions, ${fmt(perSession, 1)} matchs en moyenne`,
              `${session.sessions.length} ${session.sessions.length === 1 ? "session" : "sessions"}, ${fmt(perSession, 1)} matches on average`,
            )}
          </span>
        </div>
        <div className="session-chart">
          {session.buckets.map((bucket, index) => {
            const rate = winRate(bucket);
            return (
              <div key={index} className={`session-col${bucket.length ? "" : " none"}`}>
                <span className={`session-value ${bucket.length ? (rate >= 50 ? "win" : "bad") : "faint"}`}>{bucket.length ? pct(rate, 0) : "-"}</span>
                <div className="session-track">
                  <span className={rate >= 50 ? "win" : "bad"} style={{ height: `${bucket.length ? Math.max(3, rate) : 0}%` }} />
                  <i />
                </div>
                <strong className="session-label">
                  {index === SESSION_BUCKETS - 1
                    ? t(`${index + 1}e et +`, `${index + 1}th+`)
                    : index === 0
                      ? t("1re", "1st")
                      : t(`${index + 1}e`, ["2nd", "3rd", "4th"][index - 1])}
                </strong>
                <span className="faint session-sub">
                  {bucket.length ? t(`${fmt(average(bucket.map((game) => game.acs)))} d'ACS`, `${fmt(average(bucket.map((game) => game.acs)))} ACS`) : ""}
                </span>
                <span className="faint session-sub">{bucket.length ? matchCount(bucket.length) : ""}</span>
              </div>
            );
          })}
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          {t(
            "Victoires selon la place du match dans la session. Une session s'arrête après 2 heures sans jouer.",
            "Win rate by the match's position in the session. A session ends after 2 hours without playing.",
          )}
        </span>
      </section>

      <div className="records habit-streaks">
        <div>
          <span className="label">{t("Plus longue série de victoires", "Longest win streak")}</span>
          <strong className="win">{matchCount(streaks.bestWin)}</strong>
          <span className="faint" style={{ fontSize: 12 }}>
            {t("sur la période", "in this period")}
          </span>
        </div>
        <div>
          <span className="label">{t("Plus longue série de défaites", "Longest loss streak")}</span>
          <strong className="bad">{matchCount(streaks.bestLoss)}</strong>
          <span className="faint" style={{ fontSize: 12 }}>
            {t("sur la période", "in this period")}
          </span>
        </div>
        <div>
          <span className="label">{t("Série en cours", "Current streak")}</span>
          <strong className={streaks.currentWon ? "win" : "bad"}>
            {streaks.currentWon
              ? t(`${streaks.current} ${streaks.current > 1 ? "victoires" : "victoire"}`, `${streaks.current} ${streaks.current === 1 ? "win" : "wins"}`)
              : t(`${streaks.current} ${streaks.current > 1 ? "défaites" : "défaite"}`, `${streaks.current} ${streaks.current === 1 ? "loss" : "losses"}`)}
          </strong>
          <span className="faint" style={{ fontSize: 12 }}>
            {t("depuis ton dernier changement de résultat", "since your last result change")}
          </span>
        </div>
        <div>
          <span className="label">{t("Match joué après une défaite", "Match after a loss")}</span>
          <strong className={winRate(streaks.afterLoss) >= 50 ? "win" : "bad"}>{pct(winRate(streaks.afterLoss), 0)}</strong>
          <span className="faint" style={{ fontSize: 12 }}>
            {t(
              `de victoires, contre ${pct(winRate(streaks.afterWin), 0)} après une victoire`,
              `win rate, vs ${pct(winRate(streaks.afterWin), 0)} after a win`,
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

type Metric = {
  label: string;
  value: (games: GameSummary[]) => number | null;
  format: (value: number) => string;
  delta: (value: number) => string;
  better: 1 | -1 | 0;
};

const ratio = (top: number, bottom: number) => (bottom > 0 ? top / bottom : null);

const METRICS = (): Metric[] => [
  { label: t("Victoires", "Win rate"), value: (games) => (games.length ? winRate(games) : null), format: (v) => pct(v, 0), delta: (v) => t(`${signed(v, 0)} pts`, `${signed(v, 0)} pts`), better: 1 },
  { label: "ACS", value: (games) => (games.length ? average(games.map((game) => game.acs)) : null), format: (v) => fmt(v), delta: (v) => signed(v), better: 1 },
  {
    label: "K/D",
    value: (games) => ratio(sum(games.map((game) => game.kills)), sum(games.map((game) => game.deaths))),
    format: (v) => fmt(v, 2),
    delta: (v) => signed(v, 2),
    better: 1,
  },
  { label: "Headshot", value: (games) => (games.length ? average(games.map((game) => game.hsPct)) : null), format: (v) => pct(v), delta: (v) => t(`${signed(v, 1)} pt`, `${signed(v, 1)} pt`), better: 1 },
  {
    label: t("Rounds avec 1re mort", "First death rounds"),
    value: (games) => {
      const value = ratio(sum(games.map((game) => game.firstDeaths)), sum(games.map((game) => game.rounds)));
      return value === null ? null : value * 100;
    },
    format: (v) => pct(v),
    delta: (v) => t(`${signed(v, 1)} pt`, `${signed(v, 1)} pt`),
    better: -1,
  },
  {
    label: t("Morts tradées", "Traded deaths"),
    value: (games) => {
      const value = ratio(sum(games.map((game) => game.traded)), sum(games.map((game) => game.deaths)));
      return value === null ? null : value * 100;
    },
    format: (v) => pct(v, 0),
    delta: (v) => t(`${signed(v, 0)} pts`, `${signed(v, 0)} pts`),
    better: 1,
  },
  { label: t("Score moyen", "Avg score"), value: (games) => (games.length ? average(games.map((game) => game.score)) : null), format: (v) => `${fmt(v)}/100`, delta: (v) => signed(v), better: 1 },
  {
    label: t("RR par match", "RR per match"),
    value: (games) => {
      const changes = games.map((game) => game.rrChange).filter((change): change is number => typeof change === "number");
      return changes.length ? average(changes) : null;
    },
    format: (v) => signed(v, 1),
    delta: (v) => signed(v, 1),
    better: 1,
  },
  {
    label: t("Durée d'un match", "Match length"),
    value: (games) => {
      const lengths = games.map((game) => game.lengthMs).filter((length): length is number => typeof length === "number" && length > 0);
      return lengths.length ? average(lengths) / 60000 : null;
    },
    format: (v) => `${fmt(v)} min`,
    delta: (v) => `${signed(v)} min`,
    better: 0,
  },
  { label: t("Matchs joués", "Matches played"), value: (games) => games.length, format: (v) => fmt(v), delta: (v) => signed(v), better: 0 },
];

type SideMetric = Omit<Metric, "value"> & { now: number | null; before: number | null; pending: boolean };

function sideRate(maps: MapStat[] | null, attack: boolean) {
  if (!maps) return null;
  const played = sum(maps.map((map) => (attack ? map.attackPlayed : map.defensePlayed)));
  const won = sum(maps.map((map) => (attack ? map.attackWon : map.defenseWon)));
  return played > 0 ? (won * 100) / played : null;
}

function sideMetrics(now: MapStat[] | null, before: MapStat[] | null): SideMetric[] {
  const pending = now === null || before === null;
  return [true, false].map((attack) => ({
    label: attack ? t("Rounds gagnés ATT", "ATK rounds won") : t("Rounds gagnés DEF", "DEF rounds won"),
    now: sideRate(now, attack),
    before: sideRate(before, attack),
    format: (v: number) => pct(v, 0),
    delta: (v: number) => t(`${signed(v, 0)} pts`, `${signed(v, 0)} pts`),
    better: 1 as const,
    pending,
  }));
}

type RrRow = { key: string; name: string; icon?: string; matches: number; wins: number; net: number };

function rrRows(limit: number, games: GameSummary[], keyOf: (game: GameSummary) => string | null, nameOf: (key: string) => string, iconOf?: (key: string) => string | undefined) {
  const map = new Map<string, RrRow>();
  games.forEach((game) => {
    const key = keyOf(game);
    if (!key || typeof game.rrChange !== "number") return;
    const row = map.get(key) ?? { key, name: nameOf(key), icon: iconOf?.(key), matches: 0, wins: 0, net: 0 };
    row.matches += 1;
    row.wins += game.won ? 1 : 0;
    row.net += game.rrChange;
    map.set(key, row);
  });
  const rows = [...map.values()].sort((a, b) => b.net - a.net || b.matches - a.matches);
  if (rows.length <= limit * 2) return rows;
  return [...rows.slice(0, limit), ...rows.slice(-limit)];
}

function RrList({ title, rows, total, limit, wide }: { title: string; rows: RrRow[]; total: number; limit: number; wide?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.net)));
  return (
    <section className="stack" style={{ gap: 10, minWidth: 0 }}>
      <div className="section-head">
        <h3 className="rr-list-title">{title}</h3>
        {total > rows.length && <span className="faint">{t(`les ${limit} meilleurs et les ${limit} pires sur ${total}`, `top ${limit} and bottom ${limit} of ${total}`)}</span>}
      </div>
      {rows.length === 0 ? (
        <span className="hint">{t("Aucun match classé sur la période.", "No ranked matches in this period.")}</span>
      ) : (
        <div className={`rr-list${wide ? " wide" : ""}`}>
          {rows.map((row) => (
            <div key={row.key} className="rr-list-row">
              <span className="rr-list-icon">
                <Art src={row.icon} width={wide ? 56 : 28} height={28} alt="" />
              </span>
              <span className="stack" style={{ gap: 1, minWidth: 0 }}>
                <strong className="ellipsis">{row.name}</strong>
                <span className="faint" style={{ fontSize: 12 }}>
                  {matchCount(row.matches)}, {pct((row.wins * 100) / row.matches, 0)}
                </span>
              </span>
              <span className="rr-diverge" aria-hidden="true">
                <span className={row.net >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(row.net) / max) * 50}%` }} />
              </span>
              <strong className={`rr-list-net ${row.net > 0 ? "win" : row.net < 0 ? "bad" : ""}`}>{signed(row.net)} RR</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Comparison({ puuid, season, games }: { puuid: string; season: string | null; games: GameSummary[] }) {
  const seasons = useQuery(queries.seasons(puuid)).data ?? [];
  const current = season ?? seasons[0]?.short ?? null;
  const index = seasons.findIndex((item) => item.short === current);
  const previous = index >= 0 ? (seasons[index + 1]?.short ?? null) : null;
  const currentGames = useQuery(current ? queries.progression(puuid, current) : null).data?.games ?? null;
  const previousQuery = useQuery(previous ? queries.progression(puuid, previous) : null);
  const previousGames = previousQuery.data?.games ?? null;
  const catalog = useAgentCatalog();
  const limit = useRowLimit();
  const mapStats = useQuery(queries.maps(puuid, season)).data ?? null;
  const currentSides = useQuery(current ? queries.maps(puuid, current) : null).data ?? null;
  const previousSides = useQuery(previous ? queries.maps(puuid, previous) : null).data ?? null;

  const maps = useMemo(() => {
    const art = new Map((mapStats ?? []).map((map) => [map.name, map.listIcon ?? mapArt(map.mapId, "listviewicon")]));
    return rrRows(limit, games, (game) => game.mapName, (key) => key, (key) => art.get(key));
  }, [games, mapStats, limit]);
  const agents = useMemo(
    () =>
      rrRows(
        limit,
        games,
        (game) => game.agentId?.toLowerCase() ?? null,
        (key) => catalog?.agents.get(key)?.name ?? t("Agent inconnu", "Unknown agent"),
        (key) => agentIcon(key),
      ),
    [games, catalog, limit],
  );
  const mapTotal = new Set(games.filter((game) => typeof game.rrChange === "number").map((game) => game.mapName)).size;
  const agentTotal = new Set(games.filter((game) => typeof game.rrChange === "number").map((game) => game.agentId)).size;

  return (
    <div className="compare">
      <section className="stack" style={{ gap: 14 }}>
        <div className="section-head">
          <h2 className="section-title">{t("Par rapport à l'acte précédent", "Compared to the previous act")}</h2>
          {current && previous && (
            <span className="faint">
              {t(`${seasonLabel(current)} comparé à ${seasonLabel(previous)}`, `${seasonLabel(current)} compared to ${seasonLabel(previous)}`)}
            </span>
          )}
        </div>
        {!previous ? (
          <span className="hint">{t("Aucun acte précédent synchronisé à comparer.", "No earlier act synced to compare with.")}</span>
        ) : !currentGames || !previousGames ? (
          previousQuery.error ? (
            <p className="form-error">{previousQuery.error}</p>
          ) : (
            <SkeletonGroup className="compare-grid" label={t("Chargement de la comparaison", "Loading the comparison")}>
              {repeat(10, (item) => (
                <div className="compare-card" key={item}>
                  <SkeletonLine width="50%" size={12} />
                  <SkeletonLine width="60%" size={24} />
                  <SkeletonLine width="70%" size={12} />
                </div>
              ))}
            </SkeletonGroup>
          )
        ) : (
          <div className="compare-grid">
            {[...METRICS(), ...sideMetrics(currentSides, previousSides)].map((metric) => {
              const now = "value" in metric ? metric.value(currentGames) : metric.now;
              const before = "value" in metric ? metric.value(previousGames) : metric.before;
              const diff = now !== null && before !== null ? now - before : null;
              const flat = diff !== null && metric.delta(Math.abs(diff)) === metric.delta(0);
              const tone = diff === null || flat || metric.better === 0 ? "" : diff * metric.better > 0 ? "good" : "bad";
              return (
                <div className="compare-card" key={metric.label}>
                  <span className="label">{metric.label}</span>
                  <strong className="compare-value">{now === null ? "-" : metric.format(now)}</strong>
                  <span className="compare-delta">
                    {diff !== null && <span className={`compare-chip ${tone}`}>{flat ? t("stable", "same") : metric.delta(diff)}</span>}
                    <span className="faint">{"pending" in metric && metric.pending ? "" : before === null ? t("pas de données avant", "no earlier data") : t(`avant ${metric.format(before)}`, `before ${metric.format(before)}`)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: 14 }}>
        <div className="section-head">
          <h2 className="section-title">{t("RR gagnés et perdus", "RR won and lost")}</h2>
          <span className="faint">{t("Somme des RR sur la période sélectionnée", "Sum of RR over the selected period")}</span>
        </div>
        <div className="rr-lists">
          <RrList title={t("Par map", "By map")} rows={maps} total={mapTotal} limit={limit} wide />
          <RrList title={t("Par agent", "By agent")} rows={agents} total={agentTotal} limit={limit} />
        </div>
      </section>
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <SkeletonGroup className="habits" label={t("Chargement", "Loading")}>
      {repeat(2, (index) => (
        <section className="panel habit-panel" key={index}>
          <SkeletonLine width={180} size={19} />
          <SkeletonBlock height={260} radius={12} />
        </section>
      ))}
    </SkeletonGroup>
  );
}
