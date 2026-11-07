import "../styles/warmup.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import { fmt, formatDate, pct } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { daily, rankedLink, totals, type DayPoint, type DaySide, type WarmupMode } from "../lib/warmup";

const CHART_HEIGHT = 170;
const CHART_INSET = 10;
const DAY_ROWS = 8;
const DAY_SHORT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const DAY_LONG: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);
const dayCount = (count: number) => t(`${count} ${count > 1 ? "jours" : "jour"}`, `${count} ${count === 1 ? "day" : "days"}`);
const asDate = (day: string) => new Date(`${day}T00:00:00`);
const rate = (side: DaySide) => (side.matches > 0 ? (side.wins * 100) / side.matches : null);

type Filter = WarmupMode | null;

export function Warmup({ puuid, season }: { puuid: string; season: string | null }) {
  const query = useQuery(queries.warmup(puuid, season));
  const report = query.data ?? null;
  const [mode, setMode] = useState<Filter>(null);

  const counts = useMemo(() => {
    const games = report?.games ?? [];
    return { deathmatch: games.filter((game) => game.mode === "deathmatch").length, teamdeathmatch: games.filter((game) => game.mode === "teamdeathmatch").length };
  }, [report]);
  const games = useMemo(() => (report?.games ?? []).filter((game) => mode === null || game.mode === mode), [report, mode]);
  const sums = useMemo(() => totals(games), [games]);
  const points = useMemo(() => daily(games), [games]);
  const link = useMemo(() => rankedLink(games, report?.ranked ?? []), [games, report]);

  if (query.error && !report) return <p className="form-error">{query.error}</p>;
  if (!report) return <WarmupSkeleton />;
  if (report.games.length === 0) {
    return (
      <div className="empty journal-empty">
        <strong>{t("Aucun Deathmatch ou Team Deathmatch trouvé", "No Deathmatch or Team Deathmatch found")}</strong>
        <span>
          {t(
            "Tes parties de Deathmatch et de Team Deathmatch sont récupérées au plus une fois par heure, après la synchro de tes matchs compétitifs. Elles restent à part de tes stats en compétitif.",
            "Your Deathmatch and Team Deathmatch games are fetched at most once an hour, after your competitive matches sync. They are kept apart from your competitive stats.",
          )}
        </span>
      </div>
    );
  }

  const label = mode === "deathmatch" ? t("un DM", "a DM") : mode === "teamdeathmatch" ? t("un TDM", "a TDM") : t("un DM ou un TDM", "a DM or TDM");
  const none = mode === "deathmatch" ? t("sans DM", "no DM") : mode === "teamdeathmatch" ? t("sans TDM", "no TDM") : t("sans DM ni TDM", "no DM or TDM");

  return (
    <div className="warmup">
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="chips" role="group" aria-label={t("Filtrer par mode", "Filter by mode")}>
          <button type="button" className={`chip${mode === null ? " active" : ""}`} aria-pressed={mode === null} onClick={() => setMode(null)}>
            {t("Tous", "All")} <span className="chip-count">{report.games.length}</span>
          </button>
          {counts.deathmatch > 0 && (
            <button type="button" className={`chip${mode === "deathmatch" ? " active" : ""}`} aria-pressed={mode === "deathmatch"} onClick={() => setMode("deathmatch")}>
              Deathmatch <span className="chip-count">{counts.deathmatch}</span>
            </button>
          )}
          {counts.teamdeathmatch > 0 && (
            <button type="button" className={`chip${mode === "teamdeathmatch" ? " active" : ""}`} aria-pressed={mode === "teamdeathmatch"} onClick={() => setMode("teamdeathmatch")}>
              Team Deathmatch <span className="chip-count">{counts.teamdeathmatch}</span>
            </button>
          )}
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          {t("Historique stocké par HenrikDev, certaines parties peuvent manquer.", "History stored by HenrikDev, some games may be missing.")}
        </span>
      </div>

      <div className="compare-grid">
        <Figure label={t("Parties", "Games")} value={fmt(sums.matches)} />
        <Figure label="K/D" value={fmt(sums.kd, 2)} />
        <Figure label={t("Kills par partie", "Kills per game")} value={fmt(sums.kills, 1)} />
        <Figure label={t("Dégâts par partie", "Damage per game")} value={sums.damage !== null ? fmt(sums.damage) : "-"} />
      </div>

      <div className="warmup-charts">
        <section className="panel habit-panel">
          <div className="section-head">
            <h2 className="section-title">{t("K/D par jour", "K/D per day")}</h2>
            <span className="faint">{t(`Moyenne ${fmt(sums.kd, 2)}`, `Average ${fmt(sums.kd, 2)}`)}</span>
          </div>
          <DayChart points={points} value={(point) => point.kd} average={sums.kd} format={(value) => fmt(value, 2)} />
        </section>
        <section className="panel habit-panel">
          <div className="section-head">
            <h2 className="section-title">{t("Kills par partie, par jour", "Kills per game, per day")}</h2>
            <span className="faint">{t(`Moyenne ${fmt(sums.kills, 1)}`, `Average ${fmt(sums.kills, 1)}`)}</span>
          </div>
          <DayChart points={points} value={(point) => point.kills} average={sums.kills} format={(value) => fmt(value, 1)} />
        </section>
      </div>

      <section className="panel habit-panel">
        <div className="section-head">
          <h2 className="section-title">{t("Et en compétitif", "And in competitive")}</h2>
          <span className="faint">{t("Par jour calendaire, matchs compétitifs de la période", "Per calendar day, competitive matches of the period")}</span>
        </div>
        {link.warmed.days + link.cold.days === 0 ? (
          <span className="hint">{t("Aucun match compétitif sur cette période.", "No competitive match in this period.")}</span>
        ) : (
          <>
            <div className="warmup-sides">
              <Side
                title={t(`Jours avec ${label} avant le premier classé`, `Days with ${label} before the first ranked game`)}
                side={link.warmed}
              />
              <Side title={t(`Jours ${none} avant le premier classé`, `Days with ${none} before the first ranked game`)} side={link.cold} />
            </div>
            {link.warmed.days > 0 && (
              <p className="warmup-sentence">
                {t(
                  `${link.warmed.days > 1 ? `Ces ${dayCount(link.warmed.days)}` : "Ce jour"} : K/D ${link.warmupKd !== null ? fmt(link.warmupKd, 2) : "-"} à l'échauffement, ${link.rankedKd !== null ? fmt(link.rankedKd, 2) : "-"} sur les matchs classés qui suivent.`,
                  `${link.warmed.days > 1 ? `On these ${dayCount(link.warmed.days)}` : "On that day"}: K/D ${link.warmupKd !== null ? fmt(link.warmupKd, 2) : "-"} while warming up, ${link.rankedKd !== null ? fmt(link.rankedKd, 2) : "-"} in the ranked matches that follow.`,
                )}
              </p>
            )}
            {link.days.length > 0 && (
              <div className="warmup-days" role="table" aria-label={t("Jours avec échauffement", "Days with a warmup")}>
                <div className="warmup-day head" role="row">
                  <span role="columnheader">{t("Jour", "Day")}</span>
                  <span role="columnheader">{t("Échauffement", "Warmup")}</span>
                  <span role="columnheader">{t("K/D échauffement", "Warmup K/D")}</span>
                  <span role="columnheader">{t("Classé", "Ranked")}</span>
                  <span role="columnheader">{t("K/D classé", "Ranked K/D")}</span>
                </div>
                {link.days.slice(0, DAY_ROWS).map((day) => (
                  <div className="warmup-day" role="row" key={day.day}>
                    <span role="cell">{formatDate(asDate(day.day), DAY_LONG)}</span>
                    <span role="cell" className="muted">
                      {t(`${day.warmups} ${day.warmups > 1 ? "parties" : "partie"}`, `${day.warmups} ${day.warmups === 1 ? "game" : "games"}`)}
                    </span>
                    <span role="cell">{fmt(day.warmupKd, 2)}</span>
                    <span role="cell">
                      <span className={day.wins * 2 >= day.ranked ? "win" : "bad"}>{t(`${day.wins} V`, `${day.wins} W`)}</span>
                      <span className="faint"> {t(`sur ${day.ranked}`, `of ${day.ranked}`)}</span>
                    </span>
                    <span role="cell">{fmt(day.rankedKd, 2)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="compare-card">
      <span className="label">{label}</span>
      <span className="compare-value">{value}</span>
    </div>
  );
}

function Side({ title, side }: { title: string; side: DaySide }) {
  const value = rate(side);
  return (
    <div className="warmup-side">
      <span className="label">{title}</span>
      <strong className={value === null ? "faint" : value >= 50 ? "win" : "bad"}>{value !== null ? pct(value, 0) : "-"}</strong>
      <span className="faint">
        {value !== null
          ? t(`de victoires, ${dayCount(side.days)}, ${matchCount(side.matches)}`, `win rate, ${dayCount(side.days)}, ${matchCount(side.matches)}`)
          : t("Aucun jour", "No day")}
      </span>
    </div>
  );
}

function DayChart({
  points,
  value,
  average,
  format,
}: {
  points: DayPoint[];
  value: (point: DayPoint) => number | null;
  average: number | null;
  format: (value: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const valid = useMemo(() => points.flatMap((point) => {
    const v = value(point);
    return v === null ? [] : [{ point, v }];
  }), [points, value]);
  const ready = valid.length >= 2;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  if (!ready) return <span className="hint">{t("Pas encore assez de jours joués.", "Not enough days played yet.")}</span>;

  const values = valid.map((item) => item.v).concat(average ?? []);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const y = (v: number) => CHART_INSET + (1 - (v - lo) / span) * (CHART_HEIGHT - CHART_INSET * 2);
  const x = (index: number) => (index / (valid.length - 1)) * width;
  const line = valid.map((item, index) => `${x(index).toFixed(1)},${y(item.v).toFixed(1)}`).join(" ");
  const current = active === null ? null : valid[Math.min(active, valid.length - 1)];
  const pick = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setActive(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * (valid.length - 1)));
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        ref={ref}
        className="warmup-chart"
        onPointerMove={(event) => pick(event.clientX)}
        onPointerDown={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 && (
          <svg viewBox={`0 0 ${width} ${CHART_HEIGHT}`} role="img" aria-label={t("Courbe par jour", "Daily curve")}>
            {average !== null && <line x1="0" x2={width} y1={y(average)} y2={y(average)} className="warmup-average" />}
            <polyline points={line} className="warmup-line" />
            {current && active !== null && (
              <>
                <line x1={x(active)} x2={x(active)} y1="0" y2={CHART_HEIGHT} className="warmup-guide" />
                <circle cx={x(active)} cy={y(current.v)} r="4.5" className="warmup-dot" />
              </>
            )}
          </svg>
        )}
        {current && active !== null && (
          <div className={`warmup-tip${x(active) > width / 2 ? " left" : ""}`} style={{ left: x(active) }} role="status">
            <span className="faint">{formatDate(asDate(current.point.day), DAY_LONG)}</span>
            <strong>{format(current.v)}</strong>
            <span className="faint">{t(`${current.point.matches} ${current.point.matches > 1 ? "parties" : "partie"}`, `${current.point.matches} ${current.point.matches === 1 ? "game" : "games"}`)}</span>
          </div>
        )}
      </div>
      <div className="row between faint warmup-dates">
        <span>{formatDate(asDate(valid[0].point.day), DAY_SHORT)}</span>
        <span>{formatDate(asDate(valid[valid.length - 1].point.day), DAY_SHORT)}</span>
      </div>
    </div>
  );
}

function WarmupSkeleton() {
  return (
    <SkeletonGroup className="warmup" label={t("Chargement de l'échauffement", "Loading warmup")}>
      <div className="chips">
        {repeat(3, (index) => (
          <SkeletonBlock key={index} width={index === 0 ? 80 : 130} height={34} radius={999} />
        ))}
      </div>
      <div className="compare-grid">
        {repeat(5, (index) => (
          <div className="compare-card" key={index}>
            <SkeletonLine width={70} size={12} />
            <SkeletonLine width={60} size={26} />
          </div>
        ))}
      </div>
      <div className="warmup-charts">
        {repeat(2, (index) => (
          <section className="panel habit-panel" key={index}>
            <SkeletonLine width={120} size={19} />
            <SkeletonBlock height={CHART_HEIGHT} radius={12} />
          </section>
        ))}
      </div>
      <section className="panel habit-panel">
        <SkeletonLine width={160} size={19} />
        <div className="warmup-sides">
          {repeat(2, (index) => (
            <div className="warmup-side" key={index}>
              <SkeletonLine width="70%" size={12} />
              <SkeletonLine width={70} size={28} />
              <SkeletonLine width="50%" size={12} />
            </div>
          ))}
        </div>
      </section>
    </SkeletonGroup>
  );
}
