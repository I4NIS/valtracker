import "../styles/duels.css";
import { useMemo, useState } from "react";
import { Art } from "../components/GameArt";
import { SeasonPicker } from "../components/SeasonPicker";
import type { Account } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import type { ClutchEntry, ClutchSize, DistanceBucket, DuelReport, Matchup, OpeningSide, Rival } from "../lib/duels";
import { fmt, fullDate, pct, roleLabel } from "../lib/format";
import { cardArt, mapArt } from "../lib/gameAssets";
import { useQuery } from "../lib/query";
import { defaultSeason, queries } from "../lib/queries";

type Props = {
  account: Account;
  refreshKey: number;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
};

type Sort = "matches" | "rate";

const MATCHUP_PREVIEW = 12;
const CLUTCH_PAGE = 10;

export function Duels({ account, onOpenRound }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const query = useQuery(season === undefined ? null : queries.duels(account.puuid, season));
  const data = query.data ?? null;
  const error = query.error;

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{season ? seasonLabel(season) : "Toutes les saisons"}</span>
        <h1 className="title">Duels</h1>
        {data && data.matches > 0 && (
          <p className="muted" style={{ margin: 0 }}>
            {fmt(data.kills)} kills et {fmt(data.deaths)} morts face aux ennemis sur {fmt(data.matches)} matchs et {fmt(data.rounds)} rounds.
          </p>
        )}
      </div>

      <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />

      {error && !data && <p className="form-error">{error}</p>}

      {!data ? (
        <div className="empty">{error ? "Impossible de charger tes duels." : "Chargement de tes duels..."}</div>
      ) : data.matches === 0 ? (
        <div className="empty">Aucun match compétitif synchronisé sur cette période.</div>
      ) : (
        <>
          <OpeningSection data={data} />
          <ClutchSection key={season ?? "all"} data={data} onOpenRound={onOpenRound} />
          <MatchupSection matchups={data.matchups} />
          <DistanceSection buckets={data.distances} />
          <RivalSection nemeses={data.nemeses} victims={data.victims} />
        </>
      )}
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="row between wrap" style={{ alignItems: "baseline" }}>
      <h2 className="section-title">{title}</h2>
      {note && <span className="faint" style={{ fontSize: 13 }}>{note}</span>}
    </div>
  );
}

function Ring({ value, size = 72, tone = "good", label, empty }: { value: number; size?: number; tone?: "good" | "bad" | "win" | "gold"; label: string; empty?: boolean }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const share = empty ? 0 : Math.min(Math.max(value, 0), 100) / 100;
  return (
    <div className="duel-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" role="img" aria-label={label}>
        <circle cx="50" cy="50" r={radius} className="duel-ring-track" />
        {share > 0 && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            className={`duel-ring-fill is-${tone}`}
            strokeDasharray={`${share * circumference} ${circumference}`}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <span className="duel-ring-value" aria-hidden="true" style={{ fontSize: Math.round(size * 0.24) }}>
        {empty ? "0" : fmt(value, 0)}
        <small>%</small>
      </span>
    </div>
  );
}

function Split({ kills, deaths, label }: { kills: number; deaths: number; label: string }) {
  const total = kills + deaths;
  const share = total > 0 ? (kills / total) * 100 : 0;
  return (
    <div className="duel-split" role="img" aria-label={label}>
      {total === 0 ? (
        <span className="duel-split-empty" />
      ) : (
        <>
          {kills > 0 && <span className="duel-split-win" style={{ width: `${share}%` }} />}
          {deaths > 0 && <span className="duel-split-loss" style={{ width: `${100 - share}%` }} />}
        </>
      )}
      <i className="duel-split-mid" aria-hidden="true" />
    </div>
  );
}

function OpeningSection({ data }: { data: DuelReport }) {
  const all = data.opening.all;
  const involved = all.firstKills + all.firstDeaths;
  return (
    <section className="stack" style={{ gap: 24 }}>
      <SectionHead
        title="Duels d'ouverture"
        note={all.rounds > 0 ? `Impliqué dans le premier kill de ${pct((involved * 100) / all.rounds, 0)} des rounds` : undefined}
      />
      {involved === 0 ? (
        <div className="empty">Aucun premier kill ni première mort sur cette période.</div>
      ) : (
        <>
          <div className="duel-opening-hero">
            <div className="row" style={{ gap: 18 }}>
              <Ring value={all.successRate} size={104} label={`${pct(all.successRate, 0)} de duels d'ouverture gagnés`} />
              <div className="stack" style={{ gap: 4 }}>
                <strong style={{ fontSize: 17 }}>Duels d'ouverture gagnés</strong>
                <span className="hint">
                  {all.firstKills} gagnés sur {involved} duels d'ouverture.
                </span>
              </div>
            </div>
            <div className="duel-figure">
              <span className="label">First kills</span>
              <span className="big-number good">{fmt(all.firstKills)}</span>
              <span className="hint">Round gagné ensuite dans {pct(all.winRateAfterKill, 0)} des cas</span>
            </div>
            <div className="duel-figure">
              <span className="label">First deaths</span>
              <span className="big-number bad">{fmt(all.firstDeaths)}</span>
              <span className="hint">Round gagné ensuite dans {pct(all.winRateAfterDeath, 0)} des cas</span>
            </div>
          </div>
          <div className="duel-sides">
            <OpeningCard title="En attaque" side={data.opening.attack} />
            <OpeningCard title="En défense" side={data.opening.defense} />
          </div>
        </>
      )}
    </section>
  );
}

function OpeningCard({ title, side }: { title: string; side: OpeningSide }) {
  const involved = side.firstKills + side.firstDeaths;
  return (
    <div className="panel stack" style={{ gap: 16 }}>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <strong style={{ fontSize: 17 }}>{title}</strong>
        <span className="duel-side-rate">{involved > 0 ? pct(side.successRate, 0) : "Aucun"}</span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <Split
          kills={side.firstKills}
          deaths={side.firstDeaths}
          label={`${side.firstKills} first kills et ${side.firstDeaths} first deaths`}
        />
        <div className="row between" style={{ fontSize: 13 }}>
          <span className="good">
            <strong>{side.firstKills}</strong> first kills
          </span>
          <span className="bad">
            <strong>{side.firstDeaths}</strong> first deaths
          </span>
        </div>
      </div>
      <div className="duel-facts">
        <div>
          <span className="label">Round gagné après first kill</span>
          <strong>{side.firstKills > 0 ? pct(side.winRateAfterKill, 0) : "Pas de données"}</strong>
          <span className="faint">
            {side.wonAfterKill} sur {side.firstKills}
          </span>
        </div>
        <div>
          <span className="label">Round gagné après first death</span>
          <strong>{side.firstDeaths > 0 ? pct(side.winRateAfterDeath, 0) : "Pas de données"}</strong>
          <span className="faint">
            {side.wonAfterDeath} sur {side.firstDeaths}
          </span>
        </div>
      </div>
      <span className="faint" style={{ fontSize: 12 }}>
        {side.rounds} rounds joués de ce côté
      </span>
    </div>
  );
}

function ClutchSection({ data, onOpenRound }: { data: DuelReport; onOpenRound?: (matchId: string, roundIndex: number) => void }) {
  const clutches = data.clutches;
  const [filter, setFilter] = useState<number | null>(null);
  const [visible, setVisible] = useState(CLUTCH_PAGE);
  const list = useMemo(
    () => (filter === null ? clutches.recent : clutches.recent.filter((entry) => entry.enemies === filter)),
    [clutches.recent, filter],
  );
  const shown = list.slice(0, visible);
  const capped = filter === null ? clutches.attempts > clutches.recent.length : false;

  const choose = (enemies: number) => {
    setFilter((current) => (current === enemies ? null : enemies));
    setVisible(CLUTCH_PAGE);
  };

  return (
    <section className="stack" style={{ gap: 24 }}>
      <SectionHead
        title="Clutchs"
        note={clutches.attempts > 0 ? `${clutches.won} gagnés sur ${clutches.attempts} situations, ${pct(clutches.winRate, 0)}` : undefined}
      />
      {clutches.attempts === 0 ? (
        <div className="empty">Tu n'as jamais été le dernier en vie de ton équipe sur cette période.</div>
      ) : (
        <>
          <div className="duel-clutch-grid" role="group" aria-label="Filtrer par situation">
            {clutches.bySize.map((size) => (
              <ClutchTile key={size.enemies} size={size} active={filter === size.enemies} onToggle={() => choose(size.enemies)} />
            ))}
          </div>
          {clutches.recent.length > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row between wrap" style={{ alignItems: "baseline" }}>
                <h3 className="duel-subtitle">{filter === null ? "Toutes les situations" : `Situations en 1v${filter}`}</h3>
                <span className="faint" style={{ fontSize: 13 }}>
                  {list.length} {list.length > 1 ? "situations" : "situation"}
                  {capped ? `, les ${clutches.recent.length} plus récentes` : ""}
                  {filter !== null && (
                    <>
                      {", "}
                      <button type="button" className="duel-link" onClick={() => setFilter(null)}>
                        tout afficher
                      </button>
                    </>
                  )}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  Aucune situation en 1v{filter} sur cette période.
                </p>
              ) : (
                <ul className="duel-list">
                  {shown.map((entry) => (
                    <ClutchRow key={`${entry.matchId}-${entry.roundIndex}`} entry={entry} onOpenRound={onOpenRound} />
                  ))}
                </ul>
              )}
              {list.length > visible && (
                <button type="button" className="btn btn-secondary duel-more" onClick={() => setVisible((count) => count + CLUTCH_PAGE)}>
                  Afficher plus
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ClutchTile({ size, active, onToggle }: { size: ClutchSize; active: boolean; onToggle: () => void }) {
  const empty = size.attempts === 0;
  return (
    <button
      type="button"
      className={`duel-clutch${empty ? " is-empty" : ""}${active ? " active" : ""}`}
      onClick={onToggle}
      disabled={empty}
      aria-pressed={active}
    >
      <span className="duel-clutch-name">1v{size.enemies}</span>
      <Ring
        value={size.winRate}
        size={76}
        tone="win"
        empty={empty}
        label={empty ? `Aucune situation en 1v${size.enemies}` : `1v${size.enemies} : ${size.won} gagnés sur ${size.attempts}, ${pct(size.winRate, 0)}`}
      />
      <span className="duel-clutch-count">
        <strong>{size.won}</strong>
        <span className="faint"> / {size.attempts}</span>
      </span>
      <span className="faint" style={{ fontSize: 12 }}>
        {empty ? "aucune situation" : size.won > 1 ? "gagnés" : "gagné"}
      </span>
    </button>
  );
}

function ClutchRow({ entry, onOpenRound }: { entry: ClutchEntry; onOpenRound?: (matchId: string, roundIndex: number) => void }) {
  const body = (
    <>
      <span className="duel-clutch-map">
        <Art src={mapArt(entry.mapId, "listviewicon")} width={112} height={44} alt="" className="duel-clutch-map-art" />
        <Art src={agentIcon(entry.agentId)} width={32} height={32} alt="" className="duel-clutch-agent" />
      </span>
      <div className="stack duel-grow" style={{ gap: 2 }}>
        <strong className="ellipsis">
          {entry.mapName ?? "Map inconnue"}, round {entry.round}
        </strong>
        <span className="faint ellipsis" style={{ fontSize: 12 }}>
          {fullDate(entry.startedAt)}, {entry.kills} {entry.kills > 1 ? "kills" : "kill"} dans le round
        </span>
      </div>
      <span className="duel-pill">1v{entry.enemies}</span>
      <span className={`duel-result ${entry.won ? "is-win" : "is-loss"}`}>{entry.won ? "Gagné" : "Perdu"}</span>
    </>
  );
  return (
    <li>
      {onOpenRound ? (
        <button
          type="button"
          className="duel-list-row duel-clutch-row"
          onClick={() => onOpenRound(entry.matchId, entry.roundIndex)}
          aria-label={`Ouvrir le round ${entry.round} sur ${entry.mapName ?? "une map inconnue"}, 1v${entry.enemies} ${entry.won ? "gagné" : "perdu"}`}
        >
          {body}
        </button>
      ) : (
        <div className="duel-list-row duel-clutch-row">{body}</div>
      )}
    </li>
  );
}

function MatchupSection({ matchups }: { matchups: Matchup[] }) {
  const [sort, setSort] = useState<Sort>("matches");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => {
    const list = [...matchups];
    if (sort === "rate") {
      list.sort((a, b) => b.winRate - a.winRate || b.kills + b.deaths - (a.kills + a.deaths));
    } else {
      list.sort((a, b) => b.matches - a.matches || a.agentName.localeCompare(b.agentName));
    }
    return list;
  }, [matchups, sort]);
  const shown = expanded ? sorted : sorted.slice(0, MATCHUP_PREVIEW);

  return (
    <section className="stack" style={{ gap: 20 }}>
      <div className="row between wrap" style={{ alignItems: "center" }}>
        <h2 className="section-title">Face à chaque agent</h2>
        {matchups.length > 1 && (
          <div className="segmented" role="group" aria-label="Trier par">
            <button type="button" className={sort === "matches" ? "active" : ""} onClick={() => setSort("matches")}>
              Rencontres
            </button>
            <button type="button" className={sort === "rate" ? "active" : ""} onClick={() => setSort("rate")}>
              Duels gagnés
            </button>
          </div>
        )}
      </div>
      {matchups.length === 0 ? (
        <div className="empty">Aucun agent ennemi rencontré sur cette période.</div>
      ) : (
        <div className="duel-table">
          <div className="duel-matchup head" aria-hidden="true">
            <span />
            <span>Agent</span>
            <span className="duel-num">Matchs</span>
            <span className="duel-num duel-kd">Kills / morts</span>
            <span>Duels gagnés</span>
          </div>
          {shown.map((matchup) => (
            <MatchupRow key={matchup.agentId} matchup={matchup} />
          ))}
          {sorted.length > MATCHUP_PREVIEW && (
            <button type="button" className="btn btn-secondary duel-more" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Afficher moins" : `Afficher les ${sorted.length} agents`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function MatchupRow({ matchup }: { matchup: Matchup }) {
  const duels = matchup.kills + matchup.deaths;
  return (
    <div className="duel-matchup">
      <Art src={agentIcon(matchup.agentId)} width={36} height={36} alt={matchup.agentName} className="duel-agent" />
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <strong className="ellipsis">{matchup.agentName}</strong>
        <span className="faint ellipsis" style={{ fontSize: 12 }}>
          {roleLabel(matchup.role) || "Agent"}
        </span>
      </div>
      <span className="duel-num">{matchup.matches}</span>
      <span className="duel-num duel-kd">
        <span className="good">{matchup.kills}</span>
        <span className="faint"> / </span>
        <span className="bad">{matchup.deaths}</span>
      </span>
      <div className="duel-rate">
        <Split
          kills={matchup.kills}
          deaths={matchup.deaths}
          label={`Contre ${matchup.agentName} : ${matchup.kills} kills, ${matchup.deaths} morts`}
        />
        <strong className={duels === 0 ? "faint" : matchup.winRate >= 50 ? "good" : "bad"}>{duels === 0 ? "0 duel" : pct(matchup.winRate, 0)}</strong>
      </div>
    </div>
  );
}

function DistanceSection({ buckets }: { buckets: DistanceBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.kills + bucket.deaths, 0);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.kills + bucket.deaths));
  return (
    <section className="stack" style={{ gap: 20 }}>
      <SectionHead title="Distance des duels" note={total > 0 ? `${fmt(total)} duels avec positions connues` : undefined} />
      {total === 0 ? (
        <div className="empty">Pas assez de positions enregistrées pour mesurer la distance de tes duels.</div>
      ) : (
        <div className="duel-distances">
          {buckets.map((bucket) => {
            const count = bucket.kills + bucket.deaths;
            return (
              <div className="duel-distance" key={bucket.key}>
                <div className="stack" style={{ gap: 2 }}>
                  <strong style={{ fontSize: 15 }}>{bucket.label}</strong>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {pct((count * 100) / total, 0)} de tes duels
                  </span>
                </div>
                <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                  <div style={{ width: `${Math.max((count / max) * 100, 8)}%` }}>
                    <Split kills={bucket.kills} deaths={bucket.deaths} label={`${bucket.label} : ${bucket.kills} gagnés, ${bucket.deaths} perdus`} />
                  </div>
                  <span style={{ fontSize: 13 }}>
                    <span className="good">{bucket.kills} gagnés</span>
                    <span className="faint">, </span>
                    <span className="bad">{bucket.deaths} perdus</span>
                  </span>
                </div>
                <span className={`duel-distance-rate ${count === 0 ? "faint" : bucket.winRate >= 50 ? "good" : "bad"}`}>
                  {count === 0 ? "0" : pct(bucket.winRate, 0)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RivalSection({ nemeses, victims }: { nemeses: Rival[]; victims: Rival[] }) {
  return (
    <section className="stack" style={{ gap: 20 }}>
      <SectionHead title="Rivaux" note="Joueurs ennemis, au moins 3 kills" />
      <div className="duel-rivals">
        <RivalList
          title="Ils te tuent le plus"
          rivals={nemeses}
          tone="bad"
          main={(rival) => rival.killedMe}
          other={(rival) => `tu l'as tué ${rival.killedByMe} fois`}
          empty="Aucun joueur ne t'a tué au moins 3 fois sur cette période."
        />
        <RivalList
          title="Tes victimes favorites"
          rivals={victims}
          tone="good"
          main={(rival) => rival.killedByMe}
          other={(rival) => `il t'a tué ${rival.killedMe} fois`}
          empty="Tu n'as tué aucun joueur au moins 3 fois sur cette période."
        />
      </div>
    </section>
  );
}

function RivalFace({ rival }: { rival: Rival }) {
  const agent = <Art src={agentIcon(rival.agentId)} width={40} height={40} alt="" className="duel-agent" />;
  return (
    <span className="duel-rival-face">
      {rival.card ? (
        <>
          <Art src={cardArt(rival.card)} width={40} height={40} alt="" className="duel-rival-card" fallback={agent} />
          <Art src={agentIcon(rival.agentId)} width={20} height={20} alt="" className="duel-rival-badge" />
        </>
      ) : (
        agent
      )}
    </span>
  );
}

function RivalList({
  title,
  rivals,
  tone,
  main,
  other,
  empty,
}: {
  title: string;
  rivals: Rival[];
  tone: "good" | "bad";
  main: (rival: Rival) => number;
  other: (rival: Rival) => string;
  empty: string;
}) {
  return (
    <div className="panel stack" style={{ gap: 12 }}>
      <h3 className="duel-subtitle">{title}</h3>
      {rivals.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {empty}
        </p>
      ) : (
        <ul className="duel-list">
          {rivals.map((rival) => (
            <li className="duel-list-row" key={rival.puuid}>
              <RivalFace rival={rival} />
              <div className="stack duel-grow" style={{ gap: 2 }}>
                <span className="ellipsis">
                  <strong>{rival.name || "Inconnu"}</strong>
                  {rival.tag && <span className="faint">#{rival.tag}</span>}
                </span>
                <span className="faint ellipsis" style={{ fontSize: 12 }}>
                  {other(rival)}, {rival.matches} {rival.matches > 1 ? "matchs" : "match"}
                </span>
              </div>
              <span className={`duel-rival-count ${tone}`}>
                {main(rival)}
                <small> kills</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
