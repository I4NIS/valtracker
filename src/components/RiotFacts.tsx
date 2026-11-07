import "../styles/riot.css";
import type { MatchDetail, RiotPerformance } from "../lib/api";
import { fmt } from "../lib/format";
import { t } from "../lib/i18n";
import { gradeLabel, gradeTone, notAvailable, trendLabel, trendLevel } from "../lib/riot";

export function GradeBadge({ grade, large }: { grade: string | null | undefined; large?: boolean }) {
  if (!grade) return null;
  return (
    <span className={`grade-badge ${gradeTone(grade)}${large ? " large" : ""}`} title={t(`Note Riot : ${gradeLabel(grade)}`, `Riot grade: ${gradeLabel(grade)}`)}>
      {gradeLabel(grade)}
    </span>
  );
}

function TrendGlyph({ trend }: { trend: string }) {
  const level = trendLevel(trend);
  if (level === null) return <span className="faint">{trend}</span>;
  const up = level > 0;
  const tone = level > 0 ? "up" : level < 0 ? "down" : "flat";
  return (
    <svg className={`trend-glyph ${tone}`} width="18" height="18" viewBox="0 0 24 24" role="img" aria-label={trendLabel(trend)}>
      {level === 0 ? (
        <path d="M6 12h12" />
      ) : (
        <>
          <path d={up ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"} />
          {Math.abs(level) === 2 && <path d={up ? "M7 19l5-5 5 5" : "M7 5l5 5 5-5"} />}
        </>
      )}
    </svg>
  );
}

function RiotPanel({ riot, score }: { riot: RiotPerformance | undefined; score: number }) {
  const groups = (["combat", "utility"] as const)
    .map((group) => ({ group, list: riot?.ratings.filter((rating) => rating.group === group) ?? [] }))
    .filter((entry) => entry.list.length > 0);
  return (
    <section className="riot-panel">
      <div className="section-head">
        <h2 className="section-title">{t("Note Riot", "Riot rating")}</h2>
        <span className="faint" style={{ fontSize: 13 }}>
          {t(`Évaluation de Riot, ton score Valtracker est de ${score} sur 100`, `Riot's own evaluation, your Valtracker score is ${score} out of 100`)}
        </span>
      </div>
      {!riot ? (
        <span className="faint">{notAvailable()}</span>
      ) : (
        <div className="riot-body">
          <div className="riot-head">
            {riot.grade ? <GradeBadge grade={riot.grade} large /> : <span className="faint">{t("Pas de mention", "No grade")}</span>}
            {riot.score !== null && (
              <span className="stack" style={{ gap: 0 }}>
                <strong className="riot-score">{fmt(riot.score)}</strong>
                <span className="label">{t("score de performance", "performance score")}</span>
              </span>
            )}
          </div>
          {riot.breakdown.length > 0 && (
            <div className="riot-figures">
              {riot.breakdown.map((figure) => (
                <span key={figure.key}>
                  <small className="label">{figure.label}</small>
                  <strong>{fmt(figure.value, 1)}</strong>
                </span>
              ))}
            </div>
          )}
          {groups.map(({ group, list }) => (
            <div className="riot-trends" key={group}>
              <span className="label">{group === "combat" ? t("Combat", "Combat") : t("Utilitaires", "Utility")}</span>
              {list.map((rating) => (
                <span className="riot-trend" key={rating.key}>
                  <TrendGlyph trend={rating.trend} />
                  {rating.label}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function MatchRiot({ detail }: { detail: MatchDetail }) {
  return (
    <div className="match-riot">
      <RiotPanel riot={detail.riot} score={detail.score} />
    </div>
  );
}
