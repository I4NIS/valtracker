import { useEffect, useState } from "react";
import { MatchList } from "../components/MatchList";
import { RankBadge } from "../components/RankBadge";
import { api, errorMessage, type Account, type Overview, type RecentFlaws, type RecentMatch, type Season } from "../lib/api";
import { seasonLabel, tierLabel } from "../lib/assets";
import { fmt, greeting, pct, signed, timeAgo } from "../lib/format";

type Props = {
  account: Account;
  refreshKey: number;
  onOpenMatch: (matchId: string) => void;
};

type BigStat = {
  label: string;
  value: string;
  delta: number;
  digits: number;
  suffix: string;
  reference: string;
};

export function Home({ account, refreshKey, onOpenMatch }: Props) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState<string | null | undefined>(undefined);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<RecentMatch[]>([]);
  const [flaws, setFlaws] = useState<RecentFlaws | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSeasons(account.puuid)
      .then((list) => {
        setSeasons(list);
        setSeason((current) => (current === undefined ? (list[0]?.short ?? null) : current));
      })
      .catch((err) => setError(errorMessage(err)));
    api
      .getRecentMatches(account.puuid, 10)
      .then(setRecent)
      .catch((err) => setError(errorMessage(err)));
    api
      .getRecentFlaws(account.puuid)
      .then(setFlaws)
      .catch(() => setFlaws(null));
  }, [account.puuid, refreshKey]);

  useEffect(() => {
    if (season === undefined) return;
    api
      .getOverview(account.puuid, season)
      .then(setOverview)
      .catch((err) => setError(errorMessage(err)));
  }, [account.puuid, season, refreshKey]);

  const rr = account.rr ?? 0;
  const stats: BigStat[] = overview
    ? [
        { label: "ACS", value: fmt(overview.acs), delta: overview.acs - overview.lobby.acs, digits: 0, suffix: "", reference: `lobby ${fmt(overview.lobby.acs)}` },
        { label: "Dégâts par round", value: fmt(overview.adr, 1), delta: overview.adr - overview.lobby.adr, digits: 1, suffix: "", reference: `lobby ${fmt(overview.lobby.adr, 1)}` },
        { label: "K/D", value: fmt(overview.kd, 2), delta: overview.kd - overview.lobby.kd, digits: 2, suffix: "", reference: `lobby ${fmt(overview.lobby.kd, 2)}` },
        { label: "Headshot", value: pct(overview.hsPct), delta: overview.hsPct - overview.lobby.hsPct, digits: 1, suffix: " pt", reference: `lobby ${pct(overview.lobby.hsPct)}` },
      ]
    : [];

  return (
    <div className="content">
      <div className="stack">
        <h1 className="title">
          {greeting()}, {account.name}
        </h1>
        <p className="muted">
          {account.lastSyncAt ? `Dernière synchro ${timeAgo(account.lastSyncAt)}.` : "Première synchro en cours."}
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="hero">
        <div className="rank">
          <RankBadge tier={account.tier} size={104} label={tierLabel(account.tierName)} />
          <div className="stack" style={{ gap: 10, flexGrow: 1 }}>
            <span className="rank-name">{tierLabel(account.tierName)}</span>
            {account.tier ? (
              <div className="row" style={{ maxWidth: 300 }}>
                <div className="bar" style={{ flexGrow: 1 }}>
                  <span style={{ width: `${Math.min(rr, 100)}%` }} />
                </div>
                <strong>{rr} RR</strong>
              </div>
            ) : null}
            {account.peakTierName && (
              <span className="row muted" style={{ gap: 6, fontSize: 13 }}>
                Peak
                <RankBadge tier={account.peakTier} size={24} label={tierLabel(account.peakTierName)} />
                {tierLabel(account.peakTierName)}
              </span>
            )}
          </div>
        </div>
        {overview && overview.matches > 0 && (
          <div className="hero-stat">
            <span className="label">{season ? seasonLabel(season) : "Global"}</span>
            <span className="value">
              {overview.wins} V {overview.losses} D
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {pct(overview.winPct)} sur {overview.matches} matchs
            </span>
          </div>
        )}
      </div>

      <section className="stack" style={{ gap: 20 }}>
        <div className="chips" role="group" aria-label="Période">
          {seasons.map((item) => (
            <button
              key={item.short}
              type="button"
              className={`chip${season === item.short ? " active" : ""}`}
              onClick={() => setSeason(item.short)}
            >
              {seasonLabel(item.short)}
            </button>
          ))}
          <button type="button" className={`chip${season === null ? " active" : ""}`} onClick={() => setSeason(null)}>
            Global
          </button>
        </div>

        {overview && overview.matches > 0 ? (
          <>
            <div className="stat-grid">
              {stats.map((stat) => (
                <div className="big-stat stack" key={stat.label}>
                  <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                    {stat.label}
                  </span>
                  <span className="value">{stat.value}</span>
                  <span style={{ fontSize: 13 }}>
                    <strong className={stat.delta >= 0 ? "good" : "bad"}>
                      {signed(stat.delta, stat.digits)}
                      {stat.suffix}
                    </strong>{" "}
                    <span className="faint">{stat.reference}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="small-stats">
              <Small label="KAD" value={fmt(overview.kad, 2)} />
              <Small label="Kills par round" value={fmt(overview.killsPerRound, 2)} />
              <Small label="Kills" value={fmt(overview.kills)} />
              <Small label="Morts" value={fmt(overview.deaths)} />
              <Small label="Assists" value={fmt(overview.assists)} />
              <Small label="Rounds" value={fmt(overview.rounds)} />
            </div>
          </>
        ) : (
          <div className="empty">
            {overview ? "Aucun match compétitif synchronisé sur cette période pour l'instant." : "Chargement des statistiques..."}
          </div>
        )}
      </section>

      {flaws && flaws.deaths > 0 && (
        <section className="stack" style={{ gap: 20 }}>
          <div className="row between wrap" style={{ alignItems: "baseline" }}>
            <h2 className="section-title">Tes défauts du moment</h2>
            <span className="faint" style={{ fontSize: 13 }}>
              Sur tes {flaws.matches} derniers matchs compétitifs
            </span>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <FlawStat
              value={pct((flaws.untraded * 100) / flaws.deaths, 0)}
              title="de tes morts ne sont pas tradées"
              detail={`${flaws.untraded} sur ${flaws.deaths} : personne n'a tué ton tueur dans les 3 secondes.`}
            />
            <FlawStat
              value={pct((flaws.isolated * 100) / flaws.deaths, 0)}
              title="de tes morts arrivent isolé"
              detail={`${flaws.isolated} sur ${flaws.deaths}, sans coéquipier à moins de 15 m.`}
            />
            <FlawStat
              value={flaws.firstDeaths ? `1 / ${Math.max(1, Math.round(flaws.rounds / flaws.firstDeaths))}` : "0"}
              title="rounds où tu meurs en premier"
              detail={`${flaws.firstDeaths} first deaths en ${flaws.rounds} rounds.`}
            />
          </div>
        </section>
      )}

      <section className="stack" style={{ gap: 10 }}>
        <h2 className="section-title">Derniers matchs</h2>
        {recent.length > 0 && <span className="faint" style={{ fontSize: 13 }}>Clique sur un match pour voir son détail.</span>}
        {recent.length === 0 ? (
          <div className="empty">Tes matchs apparaîtront ici dès la fin de la synchro.</div>
        ) : (
          <MatchList matches={recent} onOpen={onOpenMatch} />
        )}
      </section>
    </div>
  );
}

function FlawStat({ value, title, detail }: { value: string; title: string; detail: string }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="flaw-value" style={{ fontSize: 44 }}>
        {value}
      </span>
      <strong style={{ fontSize: 15 }}>{title}</strong>
      <span className="hint">{detail}</span>
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack" style={{ gap: 2, minWidth: 76 }}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
