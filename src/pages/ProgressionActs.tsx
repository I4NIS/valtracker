import "../styles/ranked.css";
import { useMemo } from "react";
import { ActTriangle, rankOf, sortedWins } from "../components/ActTriangle";
import { RankBadge } from "../components/RankBadge";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import { seasonLabel, tierLabel } from "../lib/assets";
import { fmt, pct } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { tierFromName, type Act } from "../lib/ranked";

type Group = { key: string; title: string; acts: Act[] };

const ACT = /^e(\d+)a(\d+)$/i;

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

function groupByEpisode(acts: Act[]): Group[] {
  const groups: Group[] = [];
  for (const act of acts) {
    const found = ACT.exec(act.seasonShort ?? "");
    const key = found ? `e${found[1]}` : "other";
    const title = found ? t(`Épisode ${found[1]}`, `Episode ${found[1]}`) : t("Autres actes", "Other acts");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.acts.push(act);
    else groups.push({ key, title, acts: [act] });
  }
  return groups;
}

function actTitle(short: string | null): string {
  const found = ACT.exec(short ?? "");
  if (found) return t(`Acte ${found[2]}`, `Act ${found[2]}`);
  return short ? seasonLabel(short) : t("Acte inconnu", "Unknown act");
}

const endTierOf = (act: Act) => tierFromName(act.endTierName) ?? act.endTier ?? 0;

export function Acts({ puuid }: { puuid: string }) {
  const query = useQuery(queries.acts(puuid));
  const acts = query.data;
  const groups = useMemo(() => groupByEpisode(acts ?? []), [acts]);
  const totals = useMemo(() => {
    const list = acts ?? [];
    const games = list.reduce((sum, act) => sum + act.games, 0);
    const wins = list.reduce((sum, act) => sum + act.wins, 0);
    const best = [...list].sort((a, b) => endTierOf(b) - endTierOf(a))[0] ?? null;
    return { games, wins, best };
  }, [acts]);

  if (!acts) return query.error ? <p className="form-error">{query.error}</p> : <ActsSkeleton />;
  if (acts.length === 0)
    return (
      <div className="empty">
        {t("Aucun acte classé connu pour ce compte. Ils apparaissent après la prochaine synchro.", "No ranked act known for this account yet. They show up after the next sync.")}
      </div>
    );

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="acts-summary">
        <div className="stack" style={{ gap: 2 }}>
          <span className="label">{t("Actes joués", "Acts played")}</span>
          <strong>{acts.length}</strong>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <span className="label">{t("Matchs classés", "Ranked matches")}</span>
          <strong>{fmt(totals.games)}</strong>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <span className="label">{t("Victoires", "Wins")}</span>
          <strong>
            {fmt(totals.wins)} <span className="faint">{totals.games ? pct((totals.wins * 100) / totals.games, 0) : "-"}</span>
          </strong>
        </div>
        {totals.best && endTierOf(totals.best) >= 3 && (
          <div className="stack" style={{ gap: 2 }}>
            <span className="label">{t("Meilleur rang de fin d'acte", "Best end-of-act rank")}</span>
            <span className="row" style={{ gap: 8 }}>
              <RankBadge tier={endTierOf(totals.best)} size={26} label={tierLabel(totals.best.endTierName)} />
              <strong>{tierLabel(totals.best.endTierName)}</strong>
              <span className="faint">{actTitle(totals.best.seasonShort)}</span>
            </span>
          </div>
        )}
      </div>

      {groups.map((group, index) => (
        <section className="stack" style={{ gap: 12 }} key={`${group.key}-${index}`}>
          <h2 className="section-title">{group.title}</h2>
          <div className="acts-grid">
            {group.acts.map((act) => (
              <ActCard key={act.seasonId} act={act} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ActCard({ act }: { act: Act }) {
  const tier = endTierOf(act);
  const winPct = act.games ? (act.wins * 100) / act.games : 0;
  const top = sortedWins(act.actWins)[0] ?? null;
  return (
    <article className="act-card">
      <ActTriangle wins={act.actWins} size={78} />
      <div className="stack act-card-body">
        <span className="label">{actTitle(act.seasonShort)}</span>
        <span className="row" style={{ gap: 8 }}>
          <RankBadge tier={tier} size={30} label={tierLabel(act.endTierName)} />
          <strong className="act-card-rank ellipsis">{tierLabel(act.endTierName)}</strong>
          {act.endRr !== null && tier >= 3 && <span className="faint">{act.endRr} RR</span>}
        </span>
        <span className="muted act-card-line">
          {matchCount(act.games)}, {t(`${act.wins} victoires`, `${act.wins} ${act.wins === 1 ? "win" : "wins"}`)}
          {act.games > 0 && <span className={winPct >= 50 ? "win" : "bad"}> {pct(winPct, 0)}</span>}
        </span>
        {top && rankOf(top) >= 3 && (
          <span className="faint act-card-line">
            {t(`Plus haute victoire : ${tierLabel(top.name)}`, `Highest win: ${tierLabel(top.name)}`)}
          </span>
        )}
        {act.leaderboardRank !== null && act.leaderboardRank > 0 && (
          <span className="faint act-card-line">{t(`${act.leaderboardRank}e au classement`, `#${act.leaderboardRank} on the leaderboard`)}</span>
        )}
      </div>
    </article>
  );
}

function ActsSkeleton() {
  return (
    <SkeletonGroup className="stack" style={{ gap: 28 }} label={t("Chargement de tes actes", "Loading your acts")}>
      <div className="acts-summary">
        {repeat(4, (index) => (
          <div className="stack" style={{ gap: 4 }} key={index}>
            <SkeletonLine width={90} size={12} />
            <SkeletonLine width={60} size={17} />
          </div>
        ))}
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <SkeletonLine width={110} size={19} />
        <div className="acts-grid">
          {repeat(6, (index) => (
            <div className="act-card" key={index} aria-hidden="true">
              <SkeletonBlock width={78} height={68} radius={8} />
              <div className="stack act-card-body">
                <SkeletonLine width={50} size={12} />
                <SkeletonLine width="70%" size={16} />
                <SkeletonLine width="85%" size={13} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}
