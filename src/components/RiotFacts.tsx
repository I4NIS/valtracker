import "../styles/riot.css";
import type { Fact, MatchDetail, PlayerLine, RiotPerformance, Who } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt } from "../lib/format";
import { t } from "../lib/i18n";
import { gradeLabel, gradeTone, notAvailable, trendLabel, trendLevel } from "../lib/riot";
import { Art } from "./GameArt";

export function MvpBadge({ rank }: { rank: "match" | "team" | undefined }) {
  if (!rank) return null;
  return (
    <span
      className={`mvp-badge${rank === "match" ? " match" : ""}`}
      title={rank === "match" ? t("MVP du match selon Riot", "Match MVP according to Riot") : t("MVP de son équipe selon Riot", "Team MVP according to Riot")}
    >
      MVP
    </span>
  );
}

export function whoName(who: Who) {
  return who.me ? t("Toi", "You") : who.name;
}

function side(who: Who) {
  if (who.me) return "";
  return who.ally ? t("ton équipe", "your team") : t("en face", "enemy team");
}

function Person({ who, sub }: { who: Who; sub?: string }) {
  const detail = [side(who), sub].filter(Boolean).join(", ");
  return (
    <span className="mvp-person">
      <Art src={agentIcon(who.agentId)} width={32} height={32} alt="" />
      <span className="stack" style={{ gap: 0, minWidth: 0 }}>
        <strong className={`ellipsis ${who.me ? "me-text" : who.ally ? "ally-text" : "enemy-text"}`}>{whoName(who)}</strong>
        {detail && <span className="faint" style={{ fontSize: 12 }}>{detail}</span>}
      </span>
    </span>
  );
}

function asWho(line: PlayerLine, mine: boolean): Who {
  return { puuid: line.puuid, name: line.name, agentId: line.agentId, ally: mine, me: line.isMe };
}

function MvpPanel({ detail }: { detail: MatchDetail }) {
  const ours = detail.teams.flatMap((team) => team.players.map((line) => ({ line, mine: team.mine }))).find((entry) => entry.line.badge === "MVP");
  const riot = detail.mvp?.player ?? null;
  const same = riot !== null && ours !== undefined && riot.puuid === ours.line.puuid;
  const teamMvps = detail.mvp?.teams.filter((who) => who.puuid !== riot?.puuid) ?? [];
  return (
    <section className="riot-panel">
      <div className="section-head">
        <h2 className="section-title">MVP</h2>
        <span className="faint" style={{ fontSize: 13 }}>
          {t("Désigné par Riot et par le score Valtracker", "Picked by Riot and by the Valtracker score")}
        </span>
      </div>
      <div className="riot-body mvp-rows">
        <div className="mvp-row">
          <span className="label">{t("MVP Riot", "Riot MVP")}</span>
          {!detail.mvp ? <span className="faint">{notAvailable()}</span> : riot ? <Person who={riot} /> : <span className="faint">{t("Aucun MVP du match", "No match MVP")}</span>}
        </div>
        {teamMvps.length > 0 && (
          <div className="mvp-row">
            <span className="label">{t("MVP d'équipe Riot", "Riot team MVP")}</span>
            <span className="mvp-people">
              {teamMvps.map((who) => (
                <Person key={who.puuid} who={who} />
              ))}
            </span>
          </div>
        )}
        <div className="mvp-row">
          <span className="label">{t("MVP Valtracker", "Valtracker MVP")}</span>
          {ours ? (
            <Person who={asWho(ours.line, ours.mine)} sub={t(`score ${ours.line.score} sur 100`, `score ${ours.line.score} out of 100`)} />
          ) : (
            <span className="faint">{t("Pas de MVP sur un match nul", "No MVP on a draw")}</span>
          )}
        </div>
        {same && <span className="faint" style={{ fontSize: 13 }}>{t("Riot et Valtracker désignent le même joueur.", "Riot and Valtracker pick the same player.")}</span>}
      </div>
    </section>
  );
}

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

export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <ul className="riot-facts">
      {facts.map((fact) => (
        <li key={fact.text} className={fact.tone}>
          <span>{fact.text}</span>
        </li>
      ))}
    </ul>
  );
}

function BehaviorPanel({ facts }: { facts: Fact[] | undefined }) {
  return (
    <section className="riot-panel">
      <div className="section-head">
        <h2 className="section-title">{t("Comportement", "Behavior")}</h2>
        <span className="faint" style={{ fontSize: 13 }}>
          {t("AFK, tirs alliés et pénalités relevés par Riot", "AFK, friendly fire and penalties recorded by Riot")}
        </span>
      </div>
      {!facts ? (
        <span className="faint">{notAvailable()}</span>
      ) : facts.length === 0 ? (
        <span className="faint">{t("Aucun AFK, tir allié ni pénalité dans ce match.", "No AFK, friendly fire or penalty in this match.")}</span>
      ) : (
        <FactList facts={facts} />
      )}
    </section>
  );
}

export function MatchRiot({ detail }: { detail: MatchDetail }) {
  return (
    <div className="match-riot">
      <RiotPanel riot={detail.riot} score={detail.score} />
      <MvpPanel detail={detail} />
      <BehaviorPanel facts={detail.behavior} />
    </div>
  );
}
