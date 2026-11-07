import "../styles/maps.css";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { SeasonPicker } from "../components/SeasonPicker";
import { errorMessage, type Account } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, pct, signed } from "../lib/format";
import { getMapStats, type MapStat } from "../lib/mapStats";

const MIN_RANKED = 3;
const RANK_SIZE = 3;

type Props = {
  account: Account;
  refreshKey: number;
};

const matchCount = (count: number) => `${count} ${count > 1 ? "matchs" : "match"}`;
const roundCount = (count: number) => `${count} ${count > 1 ? "rounds" : "round"}`;
const rate = (won: number, played: number) => (played > 0 ? (won * 100) / played : 0);
const tone = (value: number) => (value >= 50 ? "win" : "bad");
const rrTone = (value: number) => (value > 0 ? "win" : value < 0 ? "bad" : "muted");

function record(map: MapStat) {
  const parts = [`${map.wins} V`, `${map.losses} D`];
  if (map.draws > 0) parts.push(`${map.draws} N`);
  return parts.join(", ");
}

export function Maps({ account, refreshKey }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(undefined);
  const [maps, setMaps] = useState<MapStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (season === undefined) return;
    setError(null);
    let active = true;
    getMapStats(account.puuid, season)
      .then((list) => {
        if (active) setMaps(list);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [account.puuid, season, refreshKey]);

  const selected = useMemo(
    () => maps?.find((map) => map.mapId === selectedId) ?? maps?.[0] ?? null,
    [maps, selectedId],
  );

  const ranking = useMemo(() => {
    const eligible = (maps ?? [])
      .filter((map) => map.matches >= MIN_RANKED)
      .sort((a, b) => b.winPct - a.winPct || b.matches - a.matches || a.name.localeCompare(b.name));
    const best = eligible.slice(0, Math.min(RANK_SIZE, Math.ceil(eligible.length / 2)));
    const worst = eligible.slice(best.length).slice(-RANK_SIZE).reverse();
    return { best, worst, count: eligible.length };
  }, [maps]);

  const choose = (id: string) => {
    setSelectedId(id);
    window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{season ? seasonLabel(season) : "Toutes les saisons"}</span>
        <h1 className="title">Maps</h1>
      </div>

      <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />

      {error && <p className="form-error">{error}</p>}

      {!maps ? (
        <div className="empty">Chargement de tes maps...</div>
      ) : maps.length === 0 ? (
        <div className="empty">Aucun match compétitif synchronisé sur cette période.</div>
      ) : (
        <>
          <div className="mapstat-grid" role="group" aria-label="Maps jouées">
            {maps.map((map) => (
              <button
                key={map.mapId}
                type="button"
                className={`mapstat-card${selected?.mapId === map.mapId ? " active" : ""}`}
                aria-pressed={selected?.mapId === map.mapId}
                onClick={() => choose(map.mapId)}
              >
                {map.splash && <img src={map.splash} alt="" loading="lazy" />}
                {map.rrMatches > 0 && (
                  <span className={`mapstat-card-rr ${rrTone(map.rrNet)}`}>{signed(map.rrNet)} RR</span>
                )}
                <span className="mapstat-card-body">
                  <strong className="mapstat-card-name">{map.name}</strong>
                  <span className="mapstat-card-meta">
                    <span>{matchCount(map.matches)}</span>
                    <span className={`mapstat-card-pct ${tone(map.winPct)}`}>{pct(map.winPct, 0)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {selected && <MapDetail map={selected} sectionRef={detailRef} />}

          <section className="stack" style={{ gap: 20 }}>
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="section-title">Tes meilleures et pires maps</h2>
              <span className="hint">Classement par taux de victoire, maps jouées au moins {MIN_RANKED} fois.</span>
            </div>
            {ranking.count < 2 ? (
              <div className="empty">Pas assez de maps jouées au moins {MIN_RANKED} fois sur cette période.</div>
            ) : (
              <div className="mapstat-ranking">
                <RankList title="Meilleures" maps={ranking.best} onSelect={choose} />
                <RankList title="Pires" maps={ranking.worst} onSelect={choose} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MapDetail({ map, sectionRef }: { map: MapStat; sectionRef: RefObject<HTMLElement | null> }) {
  const attack = rate(map.attackWon, map.attackPlayed);
  const defense = rate(map.defenseWon, map.defensePlayed);
  const pistol = rate(map.pistolWon, map.pistolPlayed);
  const retakes = rate(map.retakesWon, map.retakesPlayed);
  const topSite = Math.max(1, ...map.plantSites.map((site) => site.plants));
  const sitePlants = map.plantSites.reduce((sum, site) => sum + site.plants, 0);
  const icon = agentIcon(map.agentId);

  return (
    <section className="mapstat-detail" ref={sectionRef} aria-label={`Statistiques sur ${map.name}`}>
      <header className="mapstat-hero">
        {map.splash && <img src={map.splash} alt="" />}
        <div className="mapstat-hero-text">
          <span className="mapstat-hero-eyebrow">{matchCount(map.matches)}, {record(map)}</span>
          <h2 className="mapstat-hero-title">{map.name}</h2>
        </div>
        <div className="mapstat-hero-pct">
          <span className={`mapstat-hero-value ${tone(map.winPct)}`}>{pct(map.winPct, 0)}</span>
          <span className="mapstat-hero-label">de victoires</span>
        </div>
      </header>

      <div className="mapstat-numbers">
        <Figure label="RR net" value={map.rrMatches > 0 ? signed(map.rrNet) : "0"} className={rrTone(map.rrNet)} />
        <Figure label="ACS" value={fmt(map.acs)} />
        <Figure label="K/D" value={fmt(map.kd, 2)} />
        <Figure label="ADR" value={fmt(map.adr)} />
        <Figure label="Headshot" value={pct(map.hsPct)} />
      </div>

      {map.analyzed < map.matches && (
        <span className="hint">
          Détail des rounds calculé sur {map.analyzed} des {map.matches} matchs, les autres n'ont pas de données de rounds.
        </span>
      )}

      <div className="mapstat-panels">
        <div className="panel stack mapstat-panel">
          <h3 className="mapstat-panel-title">Attaque et défense</h3>
          <SideBar label="Attaque" won={map.attackWon} played={map.attackPlayed} value={attack} />
          <SideBar label="Défense" won={map.defenseWon} played={map.defensePlayed} value={defense} />
        </div>

        <div className="panel stack mapstat-panel">
          <h3 className="mapstat-panel-title">Plants par site</h3>
          <span className="hint">
            {map.plants} {map.plants > 1 ? "plants" : "plant"} en attaque sur {roundCount(map.attackPlayed)}, soit{" "}
            {pct(rate(map.plants, map.attackPlayed), 0)} des rounds.
          </span>
          {map.plantSites.length === 0 ? (
            <span className="faint">Aucun plant enregistré sur cette map.</span>
          ) : (
            <div className="mapstat-sites" role="img" aria-label="Répartition des plants par site">
              {map.plantSites.map((site) => (
                <div className="mapstat-site" key={site.site}>
                  <span className="mapstat-site-count">{site.plants}</span>
                  <span className="mapstat-site-track">
                    <span style={{ height: `${(site.plants / topSite) * 100}%` }} />
                  </span>
                  <strong className="mapstat-site-name">{site.site}</strong>
                  <span className="faint mapstat-site-share">{pct(rate(site.plants, sitePlants), 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel stack mapstat-panel">
          <h3 className="mapstat-panel-title">Rounds pistol</h3>
          <span className={`mapstat-panel-value ${map.pistolPlayed ? tone(pistol) : "muted"}`}>
            {map.pistolWon}
            <span className="faint"> / {map.pistolPlayed}</span>
          </span>
          <span className="bar mapstat-bar">
            <span className={map.pistolPlayed ? tone(pistol) : ""} style={{ width: `${pistol}%` }} />
          </span>
          <span className="hint">
            {pct(pistol, 0)} de rounds 1 et 13 gagnés.
          </span>
        </div>

        <div className="panel stack mapstat-panel">
          <h3 className="mapstat-panel-title">Retakes</h3>
          <span className={`mapstat-panel-value ${map.retakesPlayed ? tone(retakes) : "muted"}`}>
            {map.retakesWon}
            <span className="faint"> / {map.retakesPlayed}</span>
          </span>
          <span className="bar mapstat-bar">
            <span className={map.retakesPlayed ? tone(retakes) : ""} style={{ width: `${retakes}%` }} />
          </span>
          <span className="hint">
            {pct(retakes, 0)} des rounds en défense gagnés après un plant adverse.
          </span>
        </div>

        <div className="panel mapstat-panel mapstat-agent">
          <h3 className="mapstat-panel-title">Agent le plus joué</h3>
          {map.agentId ? (
            <div className="row" style={{ gap: 16 }}>
              {icon && <img src={icon} alt="" className="mapstat-agent-icon" />}
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong className="mapstat-agent-name">{map.agentName ?? "Agent inconnu"}</strong>
                <span className="muted">
                  {matchCount(map.agentMatches)} sur {map.matches},{" "}
                  <span className={tone(rate(map.agentWins, map.agentMatches))}>
                    {pct(rate(map.agentWins, map.agentMatches), 0)} de victoires
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <span className="faint">Aucun agent enregistré.</span>
          )}
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="mapstat-number">
      <span className="label">{label}</span>
      <span className={`mapstat-number-value${className ? ` ${className}` : ""}`}>{value}</span>
    </div>
  );
}

function SideBar({ label, won, played, value }: { label: string; won: number; played: number; value: number }) {
  return (
    <div className="mapstat-side">
      <div className="row between">
        <span className="mapstat-side-label">{label}</span>
        <span>
          <strong className={played ? tone(value) : "muted"}>{pct(value, 0)}</strong>{" "}
          <span className="faint">
            {won} / {roundCount(played)}
          </span>
        </span>
      </div>
      <span className="bar mapstat-bar">
        <span className={played ? tone(value) : ""} style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

function RankList({ title, maps, onSelect }: { title: string; maps: MapStat[]; onSelect: (id: string) => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="label">{title}</span>
      {maps.map((map) => (
        <button key={map.mapId} type="button" className="mapstat-rank" onClick={() => onSelect(map.mapId)}>
          {map.splash ? <img src={map.splash} alt="" loading="lazy" /> : <span className="mapstat-rank-thumb" />}
          <span className="stack" style={{ gap: 2, minWidth: 0 }}>
            <strong className="ellipsis">{map.name}</strong>
            <span className="faint">
              {matchCount(map.matches)}, {record(map)}
            </span>
          </span>
          <span className="mapstat-rank-values">
            <strong className={tone(map.winPct)}>{pct(map.winPct, 0)}</strong>
            {map.rrMatches > 0 && <span className={rrTone(map.rrNet)}>{signed(map.rrNet)} RR</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
