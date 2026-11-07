import "../styles/progression.css";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ExportRecapButton } from "../components/ExportRecap";
import { RrBreakdownFacts } from "../components/RrBreakdownFacts";
import { SeasonPicker } from "../components/SeasonPicker";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import type { Account, GameSummary, RrPoint } from "../lib/api";
import { tierNameById } from "../lib/assets";
import { fmt, formatDate, fullDate, pct, signed, tradeWindowText } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { defaultSeason, queries } from "../lib/queries";
import { Acts } from "./ProgressionActs";
import { Comparison, Habits, InsightsSkeleton } from "./ProgressionInsights";
import { RiotTrend } from "./ProgressionFacts";

const loadWarmup = () => import("./ProgressionWarmup");
const Warmup = lazy(() => loadWarmup().then((module) => ({ default: module.Warmup })));

const RECENT = 20;
const GAUGE_LENGTH = 283;
const DAY_SHORT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

type Tab = "overview" | "habits" | "compare" | "acts" | "warmup";

const TABS = (): { id: Tab; label: string }[] => [
  { id: "overview", label: t("Vue d'ensemble", "Overview") },
  { id: "habits", label: t("Habitudes", "Habits") },
  { id: "compare", label: t("Comparaison", "Comparison") },
  { id: "acts", label: t("Actes", "Acts") },
  { id: "warmup", label: t("Échauffement", "Warmup") },
];

type Props = {
  account: Account;
  refreshKey: number;
};

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export function Progression({ account }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const query = useQuery(season === undefined ? null : queries.progression(account.puuid, season));
  const tradeWindow = useQuery(queries.thresholds()).data?.values.tradeWindowMs ?? 3000;
  const data = query.data ?? null;
  const error = query.error;
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => void loadWarmup().catch(() => undefined), []);

  const games = data?.games ?? [];
  const recent = games.slice(-RECENT);
  const form = Math.round(average(recent.map((game) => game.score)));
  const projection = useMemo(() => project(data?.rr ?? [], games), [data, games]);
  const tilt = useMemo(() => tiltOf(games), [games]);
  const records = useMemo(() => recordsOf(games, data?.rr ?? []), [games, data]);
  const ranked = (data?.rr ?? []).filter((point) => (point.tier ?? 0) >= 3).length;

  return (
    <div className="content prog">
      <header className="page-head">
        <div className="page-head-title" style={{ alignItems: "center" }}>
          <h1 className="title">Progression</h1>
          <div className="segmented" role="tablist" aria-label={t("Sections de la progression", "Progression sections")}>
            {TABS().map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "active" : undefined}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className={`page-head-tools${tab === "acts" ? " is-hidden" : ""}`}>
          <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />
          {season !== undefined && (
            <ExportRecapButton kind="act" className="prog-export" account={account} season={season} label={season ? t("Exporter le récap de l'acte", "Export Act recap") : t("Exporter le récap de l'acte en cours", "Export current Act recap")} />
          )}
        </div>
      </header>

      {error && tab !== "acts" && tab !== "warmup" && <p className="form-error">{error}</p>}

      {tab === "acts" ? (
        <Acts puuid={account.puuid} />
      ) : tab === "warmup" ? (
        season === undefined ? null : (
          <Suspense fallback={<InsightsSkeleton />}>
            <Warmup puuid={account.puuid} season={season} />
          </Suspense>
        )
      ) : !data ? (
        error ? null : tab === "overview" ? <ProgressionSkeleton /> : <InsightsSkeleton />
      ) : games.length === 0 ? (
        <div className="empty">{t("Aucun match compétitif synchronisé sur cette période.", "No competitive matches synced for this period.")}</div>
      ) : tab === "habits" ? (
        <Habits games={games} />
      ) : tab === "compare" ? (
        <Comparison puuid={account.puuid} season={season ?? null} games={games} />
      ) : (
        <>
          <div className="stat-grid prog-stats" style={{ alignItems: "start" }}>
            <div className="row" style={{ gap: 18 }}>
              <svg width="120" height="72" viewBox="0 0 220 130" role="img" aria-label={t(`Forme ${form} sur 100`, `Form ${form} out of 100`)}>
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
                <strong style={{ fontSize: 17 }}>{t("Forme", "Form")}</strong>
                <span className="hint">
                  {t(`Moyenne de tes ${recent.length} derniers scores sur 100.`, `Average of your last ${recent.length === 1 ? "score" : `${recent.length} scores`} out of 100.`)}
                </span>
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
                    {t(
                      `par game à ce rythme. +${fmt(projection.avgWin, 1)} par victoire, -${fmt(projection.avgLoss, 1)} par défaite, ${pct(projection.winRate * 100)} de victoires. Il faut ${pct(projection.breakeven * 100, 0)} de victoires pour ne pas perdre de RR.`,
                      `per game at this pace. +${fmt(projection.avgWin, 1)} per win, -${fmt(projection.avgLoss, 1)} per loss, ${pct(projection.winRate * 100)} win rate. You need a ${pct(projection.breakeven * 100, 0)} win rate to not lose RR.`,
                    )}
                  </span>
                </>
              ) : (
                <span className="hint">{t("Pas assez de matchs classés pour une projection.", "Not enough ranked matches for a projection.")}</span>
              )}
            </div>

            <div className="stack">
              <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>
                Tilt
              </span>
              <span className={`head-value ${tilt.late && tilt.late.delta < -5 ? "bad" : ""}`}>
                {tilt.late ? t(`${signed(tilt.late.delta, 0)} % d'ACS`, `${signed(tilt.late.delta, 0)}% ACS`) : t("Pas de données", "No data")}
              </span>
              <span className="hint">
                {tilt.late
                  ? t(
                      `après minuit : ${fmt(tilt.late.acs)} sur ${tilt.late.count} matchs, contre ${fmt(tilt.late.other)} avant. `,
                      `after midnight: ${fmt(tilt.late.acs)} over ${tilt.late.count} ${tilt.late.count === 1 ? "match" : "matches"}, vs ${fmt(tilt.late.other)} before. `,
                    )
                  : t("Aucun match joué après minuit sur cette période. ", "No matches played after midnight in this period. ")}
                {tilt.afterLosses
                  ? t(
                      `Après 2 défaites d'affilée : ${fmt(tilt.afterLosses.acs)} d'ACS contre ${fmt(tilt.afterLosses.other)}.`,
                      `After 2 losses in a row: ${fmt(tilt.afterLosses.acs)} ACS vs ${fmt(tilt.afterLosses.other)}.`,
                    )
                  : ""}
              </span>
            </div>
          </div>

          <div className="prog-main">
            <section className="panel stack" style={{ gap: 12 }}>
              <div className="section-head">
                <h2 className="section-title">RR</h2>
                <span className="faint">
                  {t(`${ranked} matchs classés`, `${ranked} ranked ${ranked === 1 ? "match" : "matches"}`)}
                </span>
              </div>
              <RrChart points={data.rr} />
              <RrBreakdownFacts breakdown={data.rrBreakdown} />
            </section>

            <section className="stack" style={{ gap: 12 }}>
              <h2 className="section-title">Records</h2>
              <div className="records">
                {records.map((record) => (
                  <div key={record.label}>
                    <span className="label">{record.label}</span>
                    <strong>{record.value}</strong>
                    <span className="faint" style={{ fontSize: 12 }}>
                      {record.sub}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 40 }}>
            <BarChart
              title={t("ACS par match", "ACS per match")}
              average={fmt(average(recent.map((game) => game.acs)))}
              values={recent.map((game) => game.acs)}
              reference={data.lobbyAcs}
              note={t(`Bleu au-dessus de la moyenne de tes lobbys (${fmt(data.lobbyAcs)})`, `Blue above your lobby average (${fmt(data.lobbyAcs)})`)}
            />
            <BarChart
              title="Headshot"
              average={pct(average(recent.map((game) => game.hsPct)))}
              values={recent.map((game) => game.hsPct)}
              reference={data.lobbyHsPct}
              note={t(`Orange sous la moyenne de tes lobbys (${pct(data.lobbyHsPct)})`, `Orange below your lobby average (${pct(data.lobbyHsPct)})`)}
            />
            <BarChart
              title={t("Morts tradées", "Traded deaths")}
              average={pct(tradedPct(recent), 0)}
              values={recent.map((game) => (game.deaths ? (game.traded * 100) / game.deaths : 0))}
              reference={tradedPct(recent)}
              note={t(
                `Part de tes morts vengées ${tradeWindowText(tradeWindow)}, comparée à ta moyenne`,
                `Share of your deaths traded ${tradeWindowText(tradeWindow)}, compared to your average`,
              )}
            />
            <RiotTrend games={games} />
          </div>
        </>
      )}
    </div>
  );
}

function ProgressionSkeleton() {
  return (
    <SkeletonGroup className="stack" style={{ gap: 28 }} label={t("Chargement de ta progression", "Loading your progression")}>
      <div className="stat-grid prog-stats" style={{ alignItems: "start" }}>
        <div className="row" style={{ gap: 18 }}>
          <SkeletonBlock width={120} height={72} radius="72px 72px 12px 12px" />
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            <SkeletonLine width={70} size={17} />
            <SkeletonLine width="86%" size={13} />
            <SkeletonLine width="60%" size={13} />
          </div>
        </div>
        {repeat(2, (index) => (
          <div className="stack" key={index}>
            <SkeletonLine width={80} size={13} />
            <SkeletonLine width={110} size={24} />
            <SkeletonLine width="92%" size={13} />
            <SkeletonLine width="70%" size={13} />
          </div>
        ))}
      </div>
      <div className="prog-main">
        <section className="panel stack" style={{ gap: 12 }}>
          <div className="section-head">
            <SkeletonLine width={40} size={19} />
            <SkeletonLine width={120} size={14} />
          </div>
          <SkeletonBlock height={240} radius={12} />
        </section>
        <section className="stack" style={{ gap: 12 }}>
          <SkeletonLine width={90} size={19} />
          <div className="records">
            {repeat(4, (index) => (
              <div key={index}>
                <SkeletonLine width="50%" size={12} />
                <SkeletonLine width="42%" size={18} />
                <SkeletonLine width="64%" size={12} />
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 40 }}>
        {repeat(3, (chart) => (
          <div className="stack" style={{ gap: 10 }} key={chart}>
            <div className="row between" style={{ alignItems: "center" }}>
              <SkeletonLine width={110} size={16} />
              <SkeletonLine width={54} size={22} />
            </div>
            <div className="bars-chart" aria-hidden="true">
              {repeat(RECENT, (bar) => (
                <SkeletonBlock key={bar} width="auto" height={`${30 + ((bar * 37 + chart * 11) % 60)}%`} radius={3} />
              ))}
            </div>
            <SkeletonLine width="80%" size={12} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
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
    byKills && {
      label: t("Meilleure game", "Best game"),
      value: t(`${byKills.kills} kills`, `${byKills.kills} ${byKills.kills === 1 ? "kill" : "kills"}`),
      sub: `${byKills.mapName ?? ""}, ${fullDate(byKills.startedAt)}`,
    },
    byAcs && { label: t("Meilleur ACS", "Best ACS"), value: fmt(byAcs.acs), sub: `${byAcs.mapName ?? ""}, ${fullDate(byAcs.startedAt)}` },
    { label: t("Série de victoires", "Win streak"), value: t(`${best} d'affilée`, `${best} in a row`), sub: t("la plus longue sur la période", "longest in this period") },
    peak && { label: t("RR le plus haut", "Peak RR"), value: `${tierNameById(peak.tier)}, ${peak.rr ?? 0} RR`, sub: fullDate(peak.date) },
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

function rrScale(values: number[], height: number) {
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
  const inner = height - CHART_INSET * 2;
  const step = tickStep(tiers.length, (100 * inner) / (hi - lo));
  const y = (v: number) => CHART_INSET + (1 - (v - lo) / (hi - lo)) * inner;
  return { y, ticks: tiers.filter((tier) => (tier - FIRST_TIER) % step === 0) };
}

function RrChart({ points }: { points: RrPoint[] }) {
  const valid = useMemo(() => points.filter((point) => point.tier !== null && point.tier >= FIRST_TIER), [points]);
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(CHART_HEIGHT);
  const [tipWidth, setTipWidth] = useState(180);
  const [active, setActive] = useState<number | null>(null);
  const ready = valid.length >= 2;

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    setWidth(node.clientWidth);
    setHeight(node.clientHeight || CHART_HEIGHT);
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
      if (entries[0].contentRect.height > 0) setHeight(entries[0].contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  const scale = useMemo(() => (ready ? rrScale(valid.map(value), height) : null), [valid, ready, height]);
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

  if (!scale || !ready) return <span className="hint">{t("Pas encore assez de matchs classés.", "Not enough ranked matches yet.")}</span>;

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
  const below = py < height / 2;
  const change = point?.change ?? null;
  const first = new Date(valid[0].date);
  const last = new Date(valid[valid.length - 1].date);
  const short = (date: Date) => formatDate(date, DAY_SHORT);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className="rr-chart"
        tabIndex={0}
        aria-label={t("Courbe de RR, flèches gauche et droite pour parcourir les matchs", "RR graph, left and right arrows to browse matches")}
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
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t("Courbe de RR", "RR graph")}>
              {scale.ticks.map((tier) => (
                <line key={tier} x1="0" x2={width} y1={scale.y(tier * 100)} y2={scale.y(tier * 100)} className="grid" />
              ))}
              <polyline points={line} className="rr-line" />
              {point && (
                <>
                  <line x1={px} x2={px} y1="0" y2={height} className="rr-guide" />
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
    <div className="stack" style={{ gap: 10 }}>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>{title}</strong>
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
