import "../styles/riot.css";
import { FactList, GradeBadge } from "../components/RiotFacts";
import type { Conduct, Fact, GameSummary } from "../lib/api";
import { fmt, fullDate } from "../lib/format";
import { t } from "../lib/i18n";
import { GRADES, gradeLabel, gradeTone, notAvailable } from "../lib/riot";

const RECENT = 20;

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

const plural = (count: number, fr: string, en: string) => t(`${count} ${fr}${count > 1 ? "s" : ""}`, `${count} ${en}${count === 1 ? "" : "s"}`);

function conductFacts(conduct: Conduct, season: string | null): Fact[] {
  const scope = season ? t("sur cet acte", "this act") : t("sur tous les actes", "across all acts");
  const facts: Fact[] = [];
  const afkAllyWins = conduct.withAfkAlly - conduct.lossesWithAfkAlly;
  const afkEnemyLosses = conduct.withAfkEnemy - conduct.winsWithAfkEnemy;
  if (conduct.lossesWithAfkAlly > 0)
    facts.push({ tone: "bad", text: t(`${plural(conduct.lossesWithAfkAlly, "défaite", "loss")} avec un coéquipier AFK ${scope}`, `${conduct.lossesWithAfkAlly} ${conduct.lossesWithAfkAlly === 1 ? "loss" : "losses"} with an AFK teammate ${scope}`) });
  if (afkAllyWins > 0)
    facts.push({ tone: "neutral", text: t(`${plural(afkAllyWins, "victoire", "win")} avec un coéquipier AFK ${scope}`, `${plural(afkAllyWins, "victoire", "win")} with an AFK teammate ${scope}`) });
  if (conduct.winsWithAfkEnemy > 0)
    facts.push({ tone: "neutral", text: t(`${plural(conduct.winsWithAfkEnemy, "victoire", "win")} avec un adversaire AFK ${scope}`, `${plural(conduct.winsWithAfkEnemy, "victoire", "win")} with an AFK opponent ${scope}`) });
  if (afkEnemyLosses > 0)
    facts.push({ tone: "neutral", text: t(`${plural(afkEnemyLosses, "défaite", "loss")} avec un adversaire AFK ${scope}`, `${afkEnemyLosses} ${afkEnemyLosses === 1 ? "loss" : "losses"} with an AFK opponent ${scope}`) });
  const afk = Math.round(conduct.myAfkRounds);
  if (afk > 0) facts.push({ tone: "bad", text: t(`Tu as été AFK pendant ${plural(afk, "round", "round")}`, `You were AFK for ${plural(afk, "round", "round")}`) });
  const received = Math.round(conduct.friendlyFireReceived);
  if (received > 0) facts.push({ tone: "bad", text: t(`Tirs alliés : ${fmt(received)} dégâts reçus`, `Friendly fire: ${fmt(received)} damage taken`) });
  const dealt = Math.round(conduct.friendlyFireDealt);
  if (dealt > 0) facts.push({ tone: "bad", text: t(`Tirs alliés : ${fmt(dealt)} dégâts infligés à tes coéquipiers`, `Friendly fire: ${fmt(dealt)} damage dealt to your teammates`) });
  return facts;
}

export function ConductFacts({ conduct, season, total }: { conduct: Conduct | undefined; season: string | null; total: number }) {
  const facts = conduct ? conductFacts(conduct, season) : [];
  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="section-head">
        <h2 className="section-title">{t("Comportement", "Behavior")}</h2>
        {conduct && (
          <span className="faint">
            {conduct.matches < total
              ? t(`${matchCount(conduct.matches)} sur ${total} ont ces données`, `${matchCount(conduct.matches)} out of ${total} have this data`)
              : t(`sur ${matchCount(conduct.matches)}`, `over ${matchCount(conduct.matches)}`)}
          </span>
        )}
      </div>
      {!conduct ? (
        <span className="hint">{notAvailable()}</span>
      ) : facts.length === 0 ? (
        <span className="hint">{t("Aucun AFK ni tir allié sur ces matchs.", "No AFK or friendly fire in these matches.")}</span>
      ) : (
        <FactList facts={facts} />
      )}
    </section>
  );
}

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
