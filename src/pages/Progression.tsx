import "../styles/progression.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
                {data.rr.filter((point) => (point.tier ?? 0) >= 3).length} matchs classés
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
  const peak = [...rr].filter((point) => (point.tier ?? 0) >= 3).sort((a, b) => value(b) - value(a))[0];
  return [
    byKills && { label: "Meilleure game", value: `${byKills.kills} kills`, sub: `${byKills.mapName ?? ""}, ${fullDate(byKills.startedAt)}` },
    byAcs && { label: "Meilleur ACS", value: fmt(byAcs.acs), sub: `${byAcs.mapName ?? ""}, ${fullDate(byAcs.startedAt)}` },
    { label: "Série de victoires", value: `${best} d'affilée`, sub: "la plus longue sur la période" },
    peak && { label: "RR le plus haut", value: `${tierNameById(peak.tier)}, ${peak.rr ?? 0} RR`, sub: fullDate(peak.date) },
  ].filter(Boolean) as { label: string; value: string; sub: string }[];
}

const value = (point: RrPoint) => (point.tier ?? 0) * 100 + (point.rr ?? 0);

const CHART_HEIGHT = 240;
const CHART_INSET = 12;
const MAX_TICKS = 6;
const TICK_GAP = 28;
const TIP_OFFSET = 14;
const FIRST_TIER = 3;
const LAST_TIER = 27;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function tickStep(count: number, pxPerTier: number) {
  const needed = Math.max(1, Math.ceil(count / MAX_TICKS), Math.ceil(TICK_GAP / pxPerTier));
  if (needed <= 3) return needed;
  return Math.ceil(needed / 3) * 3;
}

function rrScale(values: number[]) {
  const vmin = Math.min(...values);
  const vmax = Math.max(...values);
  const pad = Math.max(15, (vmax - vmin) * 0.08);
  let lo = vmin - pad;
  let hi = vmax + pad;
  if (hi - lo < 120) {
    const mid = (vmin + vmax) / 2;
    lo = mid - 60;
    hi = mid + 60;
  }
  const boundaries = () => {
    const list: number[] = [];
    for (let tier = Math.max(FIRST_TIER, Math.ceil(lo / 100)); tier <= Math.min(LAST_TIER, Math.floor(hi / 100)); tier++) list.push(tier);
    return list;
  };
  let tiers = boundaries();
  if (tiers.length === 0) {
    lo = Math.min(lo, clamp(Math.floor(vmin / 100), FIRST_TIER, LAST_TIER) * 100 - pad);
    tiers = boundaries();
  }
  const inner = CHART_HEIGHT - CHART_INSET * 2;
  const step = tickStep(tiers.length, (100 * inner) / (hi - lo));
  const y = (v: number) => CHART_INSET + (1 - (v - lo) / (hi - lo)) * inner;
  return { y, ticks: tiers.filter((tier) => (tier - FIRST_TIER) % step === 0) };
}

function RrChart({ points }: { points: RrPoint[] }) {
  const valid = useMemo(() => points.filter((point) => point.tier !== null && point.tier >= FIRST_TIER), [points]);
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tipWidth, setTipWidth] = useState(180);
  const [active, setActive] = useState<number | null>(null);
  const ready = valid.length >= 2;

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  const scale = useMemo(() => (ready ? rrScale(valid.map(value)) : null), [valid, ready]);
  const x = (i: number) => (valid.length > 1 ? (i / (valid.length - 1)) * width : 0);
  const line = useMemo(
    () =>
      scale && width > 0
        ? valid.map((point, i) => `${((i / (valid.length - 1)) * width).toFixed(1)},${scale.y(value(point)).toFixed(1)}`).join(" ")
        : "",
    [valid, scale, width],
  );

  const index = active === null || valid.length === 0 ? null : clamp(active, 0, valid.length - 1);

  useLayoutEffect(() => {
    if (tipRef.current) setTipWidth(tipRef.current.offsetWidth);
  }, [index]);

  if (!scale || !ready) return <span className="hint">Pas encore assez de matchs classés.</span>;

  const pick = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setActive(Math.round(clamp((clientX - rect.left) / rect.width, 0, 1) * (valid.length - 1)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const last = valid.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = index === null ? last : index - step;
    else if (event.key === "ArrowRight") next = index === null ? last : index + step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActive(clamp(next, 0, last));
  };

  const point = index === null ? null : valid[index];
  const px = index === null ? 0 : x(index);
  const py = point ? scale.y(value(point)) : 0;
  const tipLeft = clamp(px + TIP_OFFSET + tipWidth > width ? px - TIP_OFFSET - tipWidth : px + TIP_OFFSET, 0, Math.max(0, width - tipWidth));
  const below = py < CHART_HEIGHT / 2;
  const change = point?.change ?? null;
  const first = new Date(valid[0].date);
  const last = new Date(valid[valid.length - 1].date);
  const short = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className="rr-chart"
        tabIndex={0}
        aria-label="Courbe de RR, flèches gauche et droite pour parcourir les matchs"
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <div className="rr-axis" aria-hidden="true">
          {scale.ticks.map((tier) => (
            <span key={tier} className="rr-tick" style={{ top: scale.y(tier * 100) }}>
              {tierNameById(tier)}
            </span>
          ))}
        </div>
        <div
          ref={plotRef}
          className="rr-plot"
          onPointerMove={(event) => pick(event.clientX)}
          onPointerDown={(event) => pick(event.clientX)}
          onPointerLeave={() => setActive(null)}
        >
          {width > 0 && (
            <svg viewBox={`0 0 ${width} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="Courbe de RR">
              {scale.ticks.map((tier) => (
                <line key={tier} x1="0" x2={width} y1={scale.y(tier * 100)} y2={scale.y(tier * 100)} className="grid" />
              ))}
              <polyline points={line} className="rr-line" />
              {point && (
                <>
                  <line x1={px} x2={px} y1="0" y2={CHART_HEIGHT} className="rr-guide" />
                  <circle cx={px} cy={py} r="5" className="rr-dot" />
                </>
              )}
            </svg>
          )}
          {point && (
            <div
              ref={tipRef}
              className="rr-tip"
              role="status"
              style={{
                left: tipLeft,
                top: below ? py + TIP_OFFSET : py - TIP_OFFSET,
                transform: below ? undefined : "translateY(-100%)",
              }}
            >
              <span className="rr-tip-date">{fullDate(point.date)}</span>
              <strong>
                {tierNameById(point.tier)}, {point.rr ?? 0} RR
              </strong>
              {change !== null && (
                <span className={`rr-tip-change ${change > 0 ? "up" : change < 0 ? "down" : ""}`}>{signed(change)} RR</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="row between faint rr-dates">
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
