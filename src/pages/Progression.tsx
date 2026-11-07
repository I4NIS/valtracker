import { useEffect, useMemo, useState } from "react";
import { SeasonPicker } from "../components/SeasonPicker";
import { api, errorMessage, type Account, type GameSummary, type Progression as Data, type RrPoint } from "../lib/api";
import { seasonLabel, tierNameById } from "../lib/assets";
import { fmt, fullDate, pct, signed } from "../lib/format";

const RECENT = 20;
const GAUGE_LENGTH = 283;

type Props = {
  account: Account;
  refreshKey: number;
};

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export function Progression({ account, refreshKey }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (season === undefined) return;
    setError(null);
    api
      .getProgression(account.puuid, season)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [account.puuid, season, refreshKey]);

  const games = data?.games ?? [];
  const recent = games.slice(-RECENT);
  const form = Math.round(average(recent.map((game) => game.score)));
  const projection = useMemo(() => project(data?.rr ?? [], games), [data, games]);
  const tilt = useMemo(() => tiltOf(games), [games]);
  const records = useMemo(() => recordsOf(games, data?.rr ?? []), [games, data]);

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{season ? seasonLabel(season) : "Toutes les saisons"}</span>
        <h1 className="title">Progression</h1>
      </div>

      <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />

      {error && <p className="form-error">{error}</p>}

      {!data ? (
        <div className="empty">Chargement de ta progression...</div>
      ) : games.length === 0 ? (
        <div className="empty">Aucun match compétitif synchronisé sur cette période.</div>
      ) : (
        <>
          <div className="stat-grid" style={{ alignItems: "start" }}>
            <div className="row" style={{ gap: 18 }}>
              <svg width="140" height="84" viewBox="0 0 220 130" role="img" aria-label={`Forme ${form} sur 100`}>
                <path d="M20 118a90 90 0 0 1 180 0" fill="none" stroke="var(--field)" strokeWidth="14" strokeLinecap="round" />
                <path
                  d="M20 118a90 90 0 0 1 180 0"
                  fill="none"
                  stroke={form >= 80 ? "var(--gold)" : form >= 50 ? "var(--good)" : "var(--bad)"}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${(form / 100) * GAUGE_LENGTH} ${GAUGE_LENGTH}`}
                />
                <text x="110" y="112" textAnchor="middle" fill="var(--text)" fontSize="50" fontWeight="700">
                  {form}
                </text>
              </svg>
              <div className="stack" style={{ gap: 4 }}>
                <strong style={{ fontSize: 17 }}>Forme</strong>
                <span className="hint">Moyenne de tes {recent.length} derniers scores sur 100.</span>
              </div>
            </div>

            <div className="stack">
              <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>
                Projection
              </span>
              {projection ? (
                <>
                  <span className={`head-value ${projection.perGame >= 0 ? "good" : "bad"}`}>{signed(projection.perGame, 1)} RR</span>
                  <span className="hint">
                    par game à ce rythme. +{fmt(projection.avgWin, 1)} par victoire, -{fmt(projection.avgLoss, 1)} par défaite,{" "}
                    {pct(projection.winRate * 100)} de victoires. Il faut {pct(projection.breakeven * 100, 0)} de victoires pour ne pas
                    perdre de RR.
                  </span>
                </>
              ) : (
                <span className="hint">Pas assez de matchs classés pour une projection.</span>
              )}
            </div>

            <div className="stack">
              <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>
                Tilt
              </span>
              <span className={`head-value ${tilt.late && tilt.late.delta < -5 ? "bad" : ""}`}>
                {tilt.late ? `${signed(tilt.late.delta, 0)} % d'ACS` : "Pas de données"}
              </span>
              <span className="hint">
                {tilt.late
                  ? `après minuit : ${fmt(tilt.late.acs)} sur ${tilt.late.count} matchs, contre ${fmt(tilt.late.other)} avant. `
                  : "Aucun match joué après minuit sur cette période. "}
                {tilt.afterLosses
                  ? `Après 2 défaites d'affilée : ${fmt(tilt.afterLosses.acs)} d'ACS contre ${fmt(tilt.afterLosses.other)}.`
                  : ""}
              </span>
            </div>
          </div>

          <section className="panel stack" style={{ gap: 16 }}>
            <div className="row between wrap">
              <h2 className="section-title">RR</h2>
              <span className="faint" style={{ fontSize: 13 }}>
                {data.rr.length} matchs classés
              </span>
            </div>
            <RrChart points={data.rr} />
          </section>

          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 40 }}>
            <BarChart
              title="ACS par match"
              average={fmt(average(recent.map((game) => game.acs)))}
              values={recent.map((game) => game.acs)}
              reference={data.lobbyAcs}
              note={`Bleu au-dessus de la moyenne de tes lobbys (${fmt(data.lobbyAcs)})`}
            />
            <BarChart
              title="Headshot"
              average={pct(average(recent.map((game) => game.hsPct)))}
              values={recent.map((game) => game.hsPct)}
              reference={data.lobbyHsPct}
              note={`Orange sous la moyenne de tes lobbys (${pct(data.lobbyHsPct)})`}
            />
            <BarChart
              title="Morts tradées"
              average={pct(tradedPct(recent), 0)}
              values={recent.map((game) => (game.deaths ? (game.traded * 100) / game.deaths : 0))}
              reference={tradedPct(recent)}
              note="Part de tes morts vengées dans les 3 secondes, comparée à ta moyenne"
            />
          </div>

          <section className="stack" style={{ gap: 12 }}>
            <h2 className="section-title">Records</h2>
            <div className="records">
              {records.map((record) => (
                <div key={record.label}>
                  <span className="label">{record.label}</span>
                  <strong>{record.value}</strong>
                  <span className="faint" style={{ fontSize: 13 }}>
                    {record.sub}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function tradedPct(games: GameSummary[]) {
  const deaths = games.reduce((sum, game) => sum + game.deaths, 0);
  const traded = games.reduce((sum, game) => sum + game.traded, 0);
  return deaths ? (traded * 100) / deaths : 0;
}

function project(rr: RrPoint[], games: GameSummary[]) {
  const wins = rr.map((point) => point.change ?? 0).filter((change) => change > 0);
  const losses = rr.map((point) => point.change ?? 0).filter((change) => change < 0);
  if (wins.length === 0 || losses.length === 0) return null;
  const avgWin = average(wins);
  const avgLoss = Math.abs(average(losses));
  const winRate = games.length ? games.filter((game) => game.won).length / games.length : wins.length / (wins.length + losses.length);
  return {
    avgWin,
    avgLoss,
    winRate,
    perGame: winRate * avgWin - (1 - winRate) * avgLoss,
    breakeven: avgLoss / (avgWin + avgLoss),
  };
}

function tiltOf(games: GameSummary[]) {
  const afterTwo: number[] = [];
  const otherwise: number[] = [];
  games.forEach((game, i) => {
    if (i < 2) return;
    (!games[i - 1].won && !games[i - 2].won ? afterTwo : otherwise).push(game.acs);
  });
  const lateGames = games.filter((game) => new Date(game.startedAt).getHours() < 5);
  const dayGames = games.filter((game) => new Date(game.startedAt).getHours() >= 5);
  const lateAcs = average(lateGames.map((game) => game.acs));
  const dayAcs = average(dayGames.map((game) => game.acs));
  return {
    late:
      lateGames.length > 0 && dayGames.length > 0
        ? { acs: lateAcs, other: dayAcs, count: lateGames.length, delta: ((lateAcs - dayAcs) / dayAcs) * 100 }
        : null,
    afterLosses: afterTwo.length > 0 && otherwise.length > 0 ? { acs: average(afterTwo), other: average(otherwise) } : null,
  };
}

function recordsOf(games: GameSummary[], rr: RrPoint[]) {
  const byKills = [...games].sort((a, b) => b.kills - a.kills)[0];
  const byAcs = [...games].sort((a, b) => b.acs - a.acs)[0];
  let best = 0;
  let current = 0;
  games.forEach((game) => {
    current = game.won ? current + 1 : 0;
    best = Math.max(best, current);
  });
  const peak = [...rr].filter((point) => point.tier !== null).sort((a, b) => value(b) - value(a))[0];
  return [
    byKills && { label: "Meilleure game", value: `${byKills.kills} kills`, sub: `${byKills.mapName ?? ""}, ${fullDate(byKills.startedAt)}` },
    byAcs && { label: "Meilleur ACS", value: fmt(byAcs.acs), sub: `${byAcs.mapName ?? ""}, ${fullDate(byAcs.startedAt)}` },
    { label: "Série de victoires", value: `${best} d'affilée`, sub: "la plus longue sur la période" },
    peak && { label: "RR le plus haut", value: `${tierNameById(peak.tier)}, ${peak.rr ?? 0} RR`, sub: fullDate(peak.date) },
  ].filter(Boolean) as { label: string; value: string; sub: string }[];
}

const value = (point: RrPoint) => (point.tier ?? 0) * 100 + (point.rr ?? 0);

function RrChart({ points }: { points: RrPoint[] }) {
  const valid = points.filter((point) => point.tier !== null);
  if (valid.length < 2) return <span className="hint">Pas encore assez de matchs classés.</span>;
  const values = valid.map(value);
  const min = Math.floor((Math.min(...values) - 10) / 100) * 100;
  const max = Math.ceil((Math.max(...values) + 10) / 100) * 100;
  const span = Math.max(max - min, 100);
  const x = (i: number) => (i / (valid.length - 1)) * 1000;
  const y = (v: number) => 230 - ((v - min) / span) * 220;
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const tiers: number[] = [];
  for (let level = min; level <= max; level += 100) tiers.push(level);
  const first = new Date(valid[0].date);
  const last = new Date(valid[valid.length - 1].date);
  const short = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="rr-chart">
        <svg viewBox="0 0 1000 240" preserveAspectRatio="none" role="img" aria-label="Courbe de RR">
          {tiers.map((level) => (
            <line key={level} x1="0" x2="1000" y1={y(level)} y2={y(level)} className="grid" />
          ))}
          <polyline points={line} className="rr-line" />
        </svg>
        {tiers.slice(0, -1).map((level) => (
          <span key={level} className="rr-label" style={{ top: `${(y(level) / 240) * 100}%` }}>
            {tierNameById(level / 100)}
          </span>
        ))}
      </div>
      <div className="row between faint" style={{ fontSize: 12 }}>
        <span>{short(first)}</span>
        <span>{short(last)}</span>
      </div>
    </div>
  );
}

function BarChart({ title, average: avg, values, reference, note }: { title: string; average: string; values: number[]; reference: number; note: string }) {
  const max = Math.max(1, ...values, reference) * 1.1;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <strong style={{ fontSize: 17, letterSpacing: "-0.02em" }}>{title}</strong>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>{avg}</span>
      </div>
      <div className="bars-chart">
        {values.map((v, i) => (
          <span key={i} className={v >= reference ? "up" : "down"} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} title={fmt(v)} />
        ))}
        <i style={{ bottom: `${(reference / max) * 100}%` }} />
      </div>
      <span className="faint" style={{ fontSize: 12 }}>
        {note}
      </span>
    </div>
  );
}
