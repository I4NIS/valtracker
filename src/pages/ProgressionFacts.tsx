import "../styles/riot.css";
import { GradeBadge } from "../components/RiotFacts";
import type { GameSummary } from "../lib/api";
import { fmt, fullDate } from "../lib/format";
import { t } from "../lib/i18n";
import { GRADES, gradeLabel, gradeTone, notAvailable } from "../lib/riot";

const RECENT = 20;

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

export function RiotTrend({ games }: { games: GameSummary[] }) {
  const rated = games.filter((game) => game.riotScore !== undefined);
  const recent = rated.slice(-RECENT);
  const scores = recent.map((game) => game.riotScore ?? 0);
  const max = Math.max(1, ...scores) * 1.1;
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
  const counts = GRADES.map((grade) => ({ grade, count: rated.filter((game) => game.riotGrade === grade).length })).filter((entry) => entry.count > 0);

  return (
    <div className="stack riot-chart" style={{ gap: 10 }}>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>{t("Note Riot", "Riot rating")}</strong>
        {recent.length > 0 && <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>{fmt(average)}</span>}
      </div>
      {recent.length === 0 ? (
        <span className="hint">{notAvailable()}</span>
      ) : (
        <>
          <div className="bars-chart">
            {recent.map((game) => (
              <span
                key={game.matchId}
                className={gradeTone(game.riotGrade)}
                style={{ height: `${Math.max(4, ((game.riotScore ?? 0) / max) * 100)}%` }}
                title={`${fullDate(game.startedAt)}, ${fmt(game.riotScore ?? 0)}${game.riotGrade ? `, ${gradeLabel(game.riotGrade)}` : ""}`}
              />
            ))}
          </div>
          <div className="riot-grades">
            {counts.map((entry) => (
              <span className="row" style={{ gap: 4 }} key={entry.grade}>
                <GradeBadge grade={entry.grade} />
                <span className="faint">{entry.count}</span>
              </span>
            ))}
            <span className="faint">
              {rated.length < games.length
                ? t(`${matchCount(rated.length)} notés sur ${games.length}`, `${matchCount(rated.length)} rated out of ${games.length}`)
                : t(`score des ${recent.length} derniers matchs`, `score of the last ${matchCount(recent.length)}`)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
