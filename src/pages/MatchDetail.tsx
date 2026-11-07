import { useEffect, useState } from "react";
import { DeathReview } from "../components/DeathReview";
import { ExportRecapButton } from "../components/ExportRecap";
import { FavoriteButton } from "../components/FavoriteButton";
import { Icon } from "../components/Icon";
import { NoteEditor } from "../components/NoteEditor";
import type { Account, RoundLine } from "../lib/api";
import { RankBadge } from "../components/RankBadge";
import { RoundDetail } from "../components/RoundDetail";
import { agentIcon } from "../lib/assets";
import { duration, fmt, fullDate, pct, placeLabel, roleLabel, scoreTone, signed } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";

type Tab = "summary" | "rounds" | "review" | "note";

const TABS = (): { id: Tab; label: string }[] => [
  { id: "summary", label: t("Résumé", "Summary") },
  { id: "rounds", label: t("Rounds", "Rounds") },
  { id: "review", label: t("Revue des morts", "Death review") },
  { id: "note", label: t("Note", "Note") },
];

type Props = {
  account: Account;
  matchId: string;
  initialRound?: number;
  initialDeath?: boolean;
  onBack: () => void;
};

function startTab(initialRound: number | undefined, initialDeath: boolean | undefined): Tab {
  if (initialRound === undefined) return "summary";
  return initialDeath ? "review" : "rounds";
}

const VISIBLE_FLAWS = 3;

export function MatchDetail({ account, matchId, initialRound, initialDeath, onBack }: Props) {
  const query = useQuery(queries.match(account.puuid, matchId));
  const detail = query.data && query.data.matchId === matchId ? query.data : null;
  const error = query.error;
  const [tab, setTab] = useState<Tab>(startTab(initialRound, initialDeath));
  const [allFlaws, setAllFlaws] = useState(false);
  const [roundIndex, setRoundIndex] = useState(initialRound ?? 0);

  useEffect(() => {
    setTab(startTab(initialRound, initialDeath));
    setRoundIndex(initialRound ?? 0);
  }, [matchId, initialRound, initialDeath]);

  const openRound = (index: number) => {
    setRoundIndex(index);
    setTab("rounds");
  };

  if (error) {
    return (
      <div className="content">
        <BackButton onBack={onBack} />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="content">
        <BackButton onBack={onBack} />
        <div className="empty">{t("Analyse du match...", "Analyzing the match...")}</div>
      </div>
    );
  }

  const flaws = allFlaws ? detail.flaws : detail.flaws.slice(0, VISIBLE_FLAWS);

  return (
    <div className="content match-detail">
      <header className="match-hero">
        <BackButton onBack={onBack} />
        {agentIcon(detail.agentId) && <img src={agentIcon(detail.agentId)} alt={detail.agentName ?? ""} />}
        <div className="stack" style={{ gap: 4, flex: "1 1 280px", minWidth: 0 }}>
          <h1 className="match-title">{detail.mapName ?? t("Map inconnue", "Unknown map")}</h1>
          <span className="muted">
            <strong className={detail.won ? "win" : "bad"}>
              {detail.won ? t("Victoire", "Victory") : t("Défaite", "Defeat")} {detail.roundsWon}-{detail.roundsLost}
            </strong>
            , {fullDate(detail.startedAt)}, {duration(detail.lengthMs)}
            {detail.agentName ? `, ${detail.agentName}` : ""}
          </span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => setTab("review")}>
            {t("Revoir mes morts", "Review my deaths")}
          </button>
          <ExportRecapButton kind="match" account={account} matchId={matchId} />
          <FavoriteButton puuid={account.puuid} matchId={matchId} kind="match" labeled />
        </div>
      </header>

      <div className="segmented" role="tablist" aria-label={t("Sections du match", "Match sections")} style={{ alignSelf: "flex-start" }}>
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

      {tab === "note" && <NoteEditor puuid={account.puuid} matchId={matchId} />}
      {tab === "review" && (
        <DeathReview
          key={`${matchId}-${initialDeath ? initialRound : "none"}`}
          puuid={account.puuid}
          matchId={matchId}
          deaths={detail.deathReviews}
          minimap={detail.minimap}
          rotation={detail.rotation}
          focusRound={initialDeath ? initialRound : undefined}
        />
      )}
      {tab === "rounds" && (
        <RoundDetail
          puuid={account.puuid}
          matchId={matchId}
          rounds={detail.rounds}
          selected={roundIndex}
          onSelect={setRoundIndex}
          minimap={detail.minimap}
          rotation={detail.rotation}
        />
      )}
      {tab === "summary" && (
        <>
          <div className="stat-grid match-stats">
            <HeadStat
              label={t("Ton score", "Your score")}
              value={String(detail.score)}
              tone={scoreTone(detail.score)}
              sub={t(`sur 100, ${placeLabel(detail.place)} sur 10`, `out of 100, ${placeLabel(detail.place)} of 10`)}
            />
            <HeadStat
              label={t("Ton équipe", "Your team")}
              value={detail.teamLevel}
              sub={t(`ACS moyen ${fmt(detail.teamAcs)} contre ${fmt(detail.enemyAcs)}`, `Avg ACS ${fmt(detail.teamAcs)} vs ${fmt(detail.enemyAcs)}`)}
            />
            {detail.rrChange !== null ? (
              <HeadStat
                label="RR"
                value={signed(detail.rrChange)}
                tone={detail.rrChange >= 0 ? "good" : "bad"}
                sub={detail.rrAfter !== null ? t(`${detail.rrAfter} RR après le match`, `${detail.rrAfter} RR after the match`) : ""}
              />
            ) : (
              <HeadStat label="K / D / A" value={`${detail.kills} / ${detail.deaths} / ${detail.assists}`} sub="" />
            )}
            <HeadStat label="ACS" value={fmt(detail.acs)} sub={t(`${fmt(detail.adr)} dégâts par round`, `${fmt(detail.adr)} damage per round`)} />
          </div>

          <section className="stack" style={{ gap: 10 }}>
            <div className="section-head">
              <h2 className="section-title">{t("Rounds", "Rounds")}</h2>
              <span className="faint" style={{ fontSize: 12 }}>
                {t(
                  "Barres : équipement de ton équipe et en face. Point orange : tu es mort. Clique sur un round pour son détail.",
                  "Bars: your team's loadout and the enemy's. Orange dot: you died. Click a round for its details.",
                )}
              </span>
            </div>
            <Timeline rounds={detail.rounds} onSelect={openRound} />
          </section>

          <div className="summary-teams">
            {detail.teams.map((team) => (
              <section className="stack" style={{ gap: 4, minWidth: 0 }} key={team.mine ? "mine" : "enemy"}>
                <div className="section-head">
                  <h2 className="section-title">{team.mine ? t("Ton équipe", "Your team") : t("Adversaires", "Opponents")}</h2>
                  <span className="faint" style={{ fontSize: 13 }}>
                    {t(
                      `${team.roundsWon} rounds, ACS moyen ${fmt(team.avgAcs)}`,
                      `${team.roundsWon} ${team.roundsWon === 1 ? "round" : "rounds"}, avg ACS ${fmt(team.avgAcs)}`,
                    )}
                  </span>
                </div>
                <div className="list-scroll">
                  <div>
                    <div className="score-row head">
                      <span />
                      <span>{t("Joueur", "Player")}</span>
                      <span />
                      <span>{t("Score", "Score")}</span>
                      <span>K / D / A</span>
                      <span>ACS</span>
                      <span>ADR</span>
                      <span>HS</span>
                    </div>
                    {team.players.map((player) => (
                      <div className={`score-row${player.isMe ? " me" : ""}`} key={player.puuid}>
                        {agentIcon(player.agentId) ? <img src={agentIcon(player.agentId)} alt={player.agentName ?? ""} /> : <span />}
                        <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                          <strong className="ellipsis">{player.name}</strong>
                          <span className="faint ellipsis" style={{ fontSize: 12 }}>
                            {player.badge ?? roleLabel(player.role)}
                          </span>
                        </span>
                        <RankBadge tier={player.tier} size={26} />
                        <strong className={scoreTone(player.score)}>{player.score}</strong>
                        <span>
                          {player.kills} / {player.deaths} / {player.assists}
                        </span>
                        <span>{fmt(player.acs)}</span>
                        <span className="muted">{fmt(player.adr)}</span>
                        <span className="muted">{pct(player.hsPct, 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>

          <section className="stack" style={{ gap: 12 }}>
            <div className="section-head">
              <h2 className="section-title">{t("Défauts détectés", "Detected flaws")}</h2>
              {detail.flaws.length > VISIBLE_FLAWS && (
                <button type="button" className="chip" onClick={() => setAllFlaws(!allFlaws)}>
                  {allFlaws
                    ? t("Masquer", "Hide")
                    : t(`Voir les ${detail.flaws.length - VISIBLE_FLAWS} autres`, `Show ${detail.flaws.length - VISIBLE_FLAWS} more`)}
                </button>
              )}
            </div>
            {detail.flaws.length === 0 && <span className="good">{t("Aucun défaut marquant sur ce match.", "No notable flaws this match.")}</span>}
            {flaws.length > 0 && (
              <div className="match-flaws">
                {flaws.map((flaw) => (
                  <div className="match-flaw" key={flaw.title}>
                    <span className="flaw-value">{flaw.value}</span>
                    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <strong>{flaw.title}</strong>
                      <span className="hint">{flaw.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="back-btn" onClick={onBack}>
      <Icon name="arrowRight" size={16} strokeWidth={2} className="flip" />
      {t("Matchs", "Matches")}
    </button>
  );
}

function HeadStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="stack">
      <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>
        {label}
      </span>
      <span className={`head-value ${tone ?? ""}`}>{value}</span>
      <span className="faint" style={{ fontSize: 13 }}>
        {sub}
      </span>
    </div>
  );
}

function Timeline({ rounds, onSelect }: { rounds: RoundLine[]; onSelect: (index: number) => void }) {
  const max = Math.max(1, ...rounds.flatMap((round) => [round.teamLoadout, round.enemyLoadout]));
  const firstDefense = rounds.findIndex((round, i) => i > 0 && round.attack !== rounds[0].attack);
  return (
    <div className="list-scroll">
      <div className="timeline">
        {rounds.map((round, i) => (
          <div key={round.number} className={`round${i === firstDefense ? " half" : ""}`} title={t(`Round ${round.number}, ${round.attack ? "attaque" : "défense"}`, `Round ${round.number}, ${round.attack ? "attack" : "defense"}`)}>
            <span className="side">{i === 0 || i === firstDefense ? (round.attack ? t("ATT", "ATK") : "DEF") : ""}</span>
            <div className="bars">
              <span className="mine" style={{ height: `${(round.teamLoadout / max) * 38}px` }} />
              <span className="theirs" style={{ height: `${(round.enemyLoadout / max) * 38}px` }} />
            </div>
            <button type="button" className={`cell${round.won ? " won" : ""}`} onClick={() => onSelect(i)} aria-label={t(`Détail du round ${round.number}`, `Round ${round.number} details`)}>
              {round.number}
            </button>
            <span className={`death-dot${round.died ? " on" : ""}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
