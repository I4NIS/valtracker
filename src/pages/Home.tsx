import "../styles/home.css";
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
  you: number;
  lobby: number;
  lobbyText: string;
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
        {
          label: "ACS",
          value: fmt(overview.acs),
          delta: overview.acs - overview.lobby.acs,
          digits: 0,
          suffix: "",
          reference: `lobby ${fmt(overview.lobby.acs)}`,
          you: overview.acs,
          lobby: overview.lobby.acs,
          lobbyText: fmt(overview.lobby.acs),
        },
        {
          label: "Dégâts par round",
          value: fmt(overview.adr, 1),
          delta: overview.adr - overview.lobby.adr,
          digits: 1,
          suffix: "",
          reference: `lobby ${fmt(overview.lobby.adr, 1)}`,
          you: overview.adr,
          lobby: overview.lobby.adr,
          lobbyText: fmt(overview.lobby.adr, 1),
        },
        {
          label: "K/D",
          value: fmt(overview.kd, 2),
          delta: overview.kd - overview.lobby.kd,
          digits: 2,
          suffix: "",
          reference: `lobby ${fmt(overview.lobby.kd, 2)}`,
          you: overview.kd,
          lobby: overview.lobby.kd,
          lobbyText: fmt(overview.lobby.kd, 2),
        },
        {
          label: "Headshot",
          value: pct(overview.hsPct),
          delta: overview.hsPct - overview.lobby.hsPct,
          digits: 1,
          suffix: " pt",
          reference: `lobby ${pct(overview.lobby.hsPct)}`,
          you: overview.hsPct,
          lobby: overview.lobby.hsPct,
          lobbyText: pct(overview.lobby.hsPct),
        },
      ]
    : [];
  const timeline = [...recent].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const recentWins = timeline.filter((game) => game.won).length;

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
          <div className="home-record">
            <WinRing wins={overview.wins} losses={overview.losses} winPct={overview.winPct} />
            <div className="stack" style={{ gap: 10 }}>
              <span className="label">{season ? seasonLabel(season) : "Global"}</span>
              <span className="home-legend">
                <i className="home-dot is-win" aria-hidden="true" />
                {overview.wins} victoires
              </span>
              <span className="home-legend">
                <i className="home-dot is-loss" aria-hidden="true" />
                {overview.losses} défaites
              </span>
              <span className="faint" style={{ fontSize: 13 }}>
                {overview.matches} matchs joués
              </span>
            </div>
          </div>
        )}
      </div>

      {timeline.length > 0 && (
        <section className="stack" style={{ gap: 14 }}>
          <div className="row between wrap" style={{ alignItems: "baseline" }}>
            <h2 className="section-title">Forme récente</h2>
            <span className="faint" style={{ fontSize: 13 }}>
              {recentWins} V {timeline.length - recentWins} D sur les {timeline.length} derniers
            </span>
          </div>
          <ul className="home-form" aria-label="Résultats des derniers matchs, du plus ancien au plus récent">
            {timeline.map((game) => {
              const text = matchText(game);
              return (
                <li key={game.matchId}>
                  <button
                    type="button"
                    className={`home-form-cell ${game.won ? "is-win" : "is-loss"}`}
                    title={text}
                    aria-label={`${text}. Ouvrir le match`}
                    onClick={() => onOpenMatch(game.matchId)}
                  >
                    {game.won ? "V" : "D"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
            <div className="stat-grid home-stat-grid">
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
                  <CompareBar stat={stat} />
                  {stat.label === "ACS" && timeline.length >= 3 && <Sparkline matches={timeline} />}
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
              ratio={flaws.untraded / flaws.deaths}
              title="de tes morts ne sont pas tradées"
              detail={`${flaws.untraded} sur ${flaws.deaths} : personne n'a tué ton tueur dans les 3 secondes.`}
            />
            <FlawStat
              value={pct((flaws.isolated * 100) / flaws.deaths, 0)}
              ratio={flaws.isolated / flaws.deaths}
              title="de tes morts arrivent isolé"
              detail={`${flaws.isolated} sur ${flaws.deaths}, sans coéquipier à moins de 15 m.`}
            />
            <FlawStat
              value={flaws.firstDeaths ? `1 / ${Math.max(1, Math.round(flaws.rounds / flaws.firstDeaths))}` : "0"}
              ratio={flaws.rounds ? flaws.firstDeaths / flaws.rounds : 0}
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

function matchText(game: RecentMatch): string {
  const result = game.won ? "Victoire" : "Défaite";
  return `${game.mapName ?? "Map inconnue"}, ${result} ${game.roundsWon}-${game.roundsLost}, ACS ${fmt(game.acs)}`;
}

function WinRing({ wins, losses, winPct }: { wins: number; losses: number; winPct: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const total = wins + losses;
  const share = total > 0 ? wins / total : 0;
  const gap = wins > 0 && losses > 0 ? 4 : 0;
  const winLength = Math.max(share * circumference - gap, 0);
  const lossLength = Math.max((1 - share) * circumference - gap, 0);
  return (
    <div className="home-ring">
      <svg viewBox="0 0 120 120" role="img" aria-label={`Taux de victoire ${pct(winPct, 0)} : ${wins} victoires, ${losses} défaites`}>
        <g transform="rotate(-90 60 60)">
          {total === 0 && <circle cx="60" cy="60" r={radius} className="home-ring-empty" />}
          {lossLength > 0 && (
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="home-ring-loss"
              strokeDasharray={`${lossLength} ${circumference}`}
              strokeDashoffset={-(share * circumference + gap / 2)}
            />
          )}
          {winLength > 0 && (
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="home-ring-win"
              strokeDasharray={`${winLength} ${circumference}`}
              strokeDashoffset={-gap / 2}
            />
          )}
        </g>
      </svg>
      <div className="home-ring-center" aria-hidden="true">
        <span className="home-ring-value">{pct(winPct, 0)}</span>
        <span className="home-ring-record">
          {wins} V {losses} D
        </span>
      </div>
    </div>
  );
}

function CompareBar({ stat }: { stat: BigStat }) {
  const max = 1.4 * Math.max(stat.you, stat.lobby);
  const you = max > 0 ? (Math.max(stat.you, 0) / max) * 100 : 0;
  const lobby = max > 0 ? (Math.max(stat.lobby, 0) / max) * 100 : 0;
  return (
    <div className="home-compare" role="img" aria-label={`${stat.label} : toi ${stat.value}, moyenne du lobby ${stat.lobbyText}`}>
      <div className="home-compare-track">
        <span className={`home-compare-fill ${stat.delta >= 0 ? "is-above" : "is-below"}`} style={{ width: `${you}%` }} />
        <span className="home-compare-tick" style={{ left: `${lobby}%` }} />
      </div>
      <span className="home-compare-label" style={{ left: `${lobby}%` }} aria-hidden="true">
        lobby
      </span>
    </div>
  );
}

function Sparkline({ matches }: { matches: RecentMatch[] }) {
  const width = 200;
  const height = 44;
  const pad = 5;
  const values = matches.map((game) => game.acs);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = matches.map((game, index) => ({
    game,
    x: pad + (index * (width - pad * 2)) / Math.max(matches.length - 1, 1),
    y: max === min ? height / 2 : pad + ((max - game.acs) * (height - pad * 2)) / span,
  }));
  return (
    <div className="home-spark">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`ACS sur les ${matches.length} derniers matchs, de ${fmt(min)} à ${fmt(max)}`}>
        <polyline className="home-spark-line" points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
        {points.map((point) => (
          <circle key={point.game.matchId} cx={point.x} cy={point.y} r="3.2" className={point.game.won ? "is-win" : "is-loss"}>
            <title>{matchText(point.game)}</title>
          </circle>
        ))}
      </svg>
      <span className="faint">ACS des {matches.length} derniers matchs</span>
    </div>
  );
}

function FlawStat({ value, ratio, title, detail }: { value: string; ratio: number; title: string; detail: string }) {
  const share = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="flaw-value" style={{ fontSize: 44 }}>
        {value}
      </span>
      <div className="home-gauge" role="img" aria-label={`${pct(share, 0)} des cas`}>
        <span style={{ width: `${share}%` }} />
      </div>
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
