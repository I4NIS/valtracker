import { useEffect, useState } from "react";
import { DeathReview } from "../components/DeathReview";
import { ExportRecapButton } from "../components/ExportRecap";
import { Icon } from "../components/Icon";
import { NoteEditor } from "../components/NoteEditor";
import type { Account, RoundLine } from "../lib/api";
import { RankBadge } from "../components/RankBadge";
import { RoundDetail } from "../components/RoundDetail";
import { agentIcon } from "../lib/assets";
import { duration, fmt, fullDate, pct, placeLabel, roleLabel, scoreTone, signed } from "../lib/format";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";

type Tab = "summary" | "rounds" | "review" | "note";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Résumé" },
  { id: "rounds", label: "Rounds" },
  { id: "review", label: "Revue des morts" },
  { id: "note", label: "Note" },
];

type Props = {
  account: Account;
  matchId: string;
  initialRound?: number;
  onBack: () => void;
};

const VISIBLE_FLAWS = 3;

export function MatchDetail({ account, matchId, initialRound, onBack }: Props) {
  const query = useQuery(queries.match(account.puuid, matchId));
  const detail = query.data && query.data.matchId === matchId ? query.data : null;
  const error = query.error;
  const [tab, setTab] = useState<Tab>(initialRound === undefined ? "summary" : "rounds");
  const [allFlaws, setAllFlaws] = useState(false);
  const [roundIndex, setRoundIndex] = useState(initialRound ?? 0);

  useEffect(() => {
    setTab(initialRound === undefined ? "summary" : "rounds");
    setRoundIndex(initialRound ?? 0);
  }, [matchId, initialRound]);

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
        <div className="empty">Analyse du match...</div>
      </div>
    );
  }

  const flaws = allFlaws ? detail.flaws : detail.flaws.slice(0, VISIBLE_FLAWS);

  return (
    <div className="content">
      <BackButton onBack={onBack} />

      <header className="match-hero">
        {agentIcon(detail.agentId) && <img src={agentIcon(detail.agentId)} alt={detail.agentName ?? ""} />}
        <div className="stack" style={{ gap: 8, flex: "1 1 320px" }}>
          <span className="eyebrow">Match compétitif</span>
          <h1 className="match-title">{detail.mapName ?? "Map inconnue"}</h1>
          <span className="muted">
            <strong className={detail.won ? "win" : "bad"}>
              {detail.won ? "Victoire" : "Défaite"} {detail.roundsWon}-{detail.roundsLost}
            </strong>
            , {fullDate(detail.startedAt)}, {duration(detail.lengthMs)}
            {detail.agentName ? `, ${detail.agentName}` : ""}
          </span>
          <div className="row" style={{ paddingTop: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => setTab("review")}>
              Revoir mes morts
            </button>
            <ExportRecapButton kind="match" account={account} matchId={matchId} />
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <HeadStat label="Ton score" value={String(detail.score)} tone={scoreTone(detail.score)} sub={`sur 100, ${placeLabel(detail.place)} sur 10`} />
        <HeadStat label="Ton équipe" value={detail.teamLevel} sub={`ACS moyen ${fmt(detail.teamAcs)} contre ${fmt(detail.enemyAcs)}`} />
        {detail.rrChange !== null ? (
          <HeadStat
            label="RR"
            value={signed(detail.rrChange)}
            tone={detail.rrChange >= 0 ? "good" : "bad"}
            sub={detail.rrAfter !== null ? `${detail.rrAfter} RR après le match` : ""}
          />
        ) : (
          <HeadStat label="K / D / A" value={`${detail.kills} / ${detail.deaths} / ${detail.assists}`} sub="" />
        )}
        <HeadStat label="ACS" value={fmt(detail.acs)} sub={`${fmt(detail.adr)} dégâts par round`} />
      </div>

      <div className="segmented" role="tablist" aria-label="Sections du match" style={{ alignSelf: "flex-start" }}>
        {TABS.map((item) => (
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
      {tab === "review" && <DeathReview deaths={detail.deathReviews} minimap={detail.minimap} rotation={detail.rotation} />}
      {tab === "rounds" && <RoundDetail rounds={detail.rounds} selected={roundIndex} onSelect={setRoundIndex} />}
      {tab === "summary" && (
        <>
          <section className="stack" style={{ gap: 14 }}>
            <div className="row between wrap">
              <h2 className="section-title">Rounds</h2>
              <span className="faint" style={{ fontSize: 12 }}>
                Barres : équipement de ton équipe et en face. Point orange : tu es mort. Clique sur un round pour son détail.
              </span>
            </div>
            <Timeline rounds={detail.rounds} onSelect={openRound} />
          </section>

          <div className="summary-grid">
            <div className="stack" style={{ gap: 32, minWidth: 0 }}>
              {detail.teams.map((team) => (
                <section className="stack" style={{ gap: 6 }} key={team.mine ? "mine" : "enemy"}>
                  <div className="row between">
                    <h2 className="section-title">{team.mine ? "Ton équipe" : "Adversaires"}</h2>
                    <span className="faint" style={{ fontSize: 13 }}>
                      {team.roundsWon} rounds, ACS moyen {fmt(team.avgAcs)}
                    </span>
                  </div>
                  <div className="list-scroll">
                    <div>
                      <div className="score-row head">
                        <span />
                        <span>Joueur</span>
                        <span />
                        <span>Score</span>
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

            <section className="stack" style={{ gap: 20 }}>
              <h2 className="section-title">Défauts détectés</h2>
              {detail.flaws.length === 0 && <span className="good">Aucun défaut marquant sur ce match.</span>}
              {flaws.map((flaw) => (
                <div className="stack" style={{ gap: 4 }} key={flaw.title}>
                  <span className="flaw-value">{flaw.value}</span>
                  <strong>{flaw.title}</strong>
                  <span className="hint">{flaw.detail}</span>
                </div>
              ))}
              {detail.flaws.length > VISIBLE_FLAWS && (
                <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setAllFlaws(!allFlaws)}>
                  {allFlaws ? "Masquer" : `Voir les ${detail.flaws.length - VISIBLE_FLAWS} autres`}
                </button>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="back-btn" onClick={onBack}>
      <Icon name="arrowRight" size={16} strokeWidth={2} className="flip" />
      Matchs
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
          <div key={round.number} className={`round${i === firstDefense ? " half" : ""}`} title={`Round ${round.number}, ${round.attack ? "attaque" : "défense"}`}>
            <span className="side">{i === 0 || i === firstDefense ? (round.attack ? "ATT" : "DEF") : ""}</span>
            <div className="bars">
              <span className="mine" style={{ height: `${(round.teamLoadout / max) * 46}px` }} />
              <span className="theirs" style={{ height: `${(round.enemyLoadout / max) * 46}px` }} />
            </div>
            <button type="button" className={`cell${round.won ? " won" : ""}`} onClick={() => onSelect(i)} aria-label={`Détail du round ${round.number}`}>
              {round.number}
            </button>
            <span className={`death-dot${round.died ? " on" : ""}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
