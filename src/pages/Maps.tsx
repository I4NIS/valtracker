import "../styles/maps.css";
import { useEffect, useMemo, useState } from "react";
import { Art } from "../components/GameArt";
import { Icon } from "../components/Icon";
import { MapHistoryView } from "../components/MapHistoryView";
import { SeasonPicker } from "../components/SeasonPicker";
import type { Account } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, pct, signed } from "../lib/format";
import { mapArt } from "../lib/gameAssets";
import type { MapStat } from "../lib/mapStats";
import { rotatePoint, rotationStyle } from "../lib/minimap";
import { t } from "../lib/i18n";
import { prefetch, useQuery } from "../lib/query";
import { defaultSeason, queries } from "../lib/queries";

const MIN_RANKED = 3;
const RANK_SIZE = 3;

type Props = {
  account: Account;
  refreshKey: number;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
};

type Tab = "history" | "stats";

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);
const roundCount = (count: number) => t(`${count} ${count > 1 ? "rounds" : "round"}`, `${count} ${count === 1 ? "round" : "rounds"}`);
const rate = (won: number, played: number) => (played > 0 ? (won * 100) / played : 0);
const tone = (value: number) => (value >= 50 ? "win" : "bad");
const rrTone = (value: number) => (value > 0 ? "win" : value < 0 ? "bad" : "muted");

function record(map: MapStat) {
  const parts = [t(`${map.wins} V`, `${map.wins} W`), t(`${map.losses} D`, `${map.losses} L`)];
  if (map.draws > 0) parts.push(t(`${map.draws} N`, `${map.draws} D`));
  return parts.join(", ");
}

export function Maps({ account, onOpenRound }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const query = useQuery(season === undefined ? null : queries.maps(account.puuid, season));
  const maps = query.data ?? null;
  const error = query.error;
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = maps?.find((map) => map.mapId === openId) ?? null;

  const ranking = useMemo(() => {
    const eligible = (maps ?? [])
      .filter((map) => map.matches >= MIN_RANKED)
      .sort((a, b) => b.winPct - a.winPct || b.matches - a.matches || a.name.localeCompare(b.name));
    const best = eligible.slice(0, Math.min(RANK_SIZE, Math.ceil(eligible.length / 2)));
    const worst = eligible.slice(best.length).slice(-RANK_SIZE).reverse();
    return { best, worst, count: eligible.length };
  }, [maps]);

  const choose = (id: string) => {
    setOpenId(id);
  };

  const warm = (id: string) => {
    prefetch(queries.mapHistory(account.puuid, id));
  };

  if (opened) {
    return (
      <MapView
        key={opened.mapId}
        puuid={account.puuid}
        map={opened}
        season={season ?? null}
        onBack={() => setOpenId(null)}
        onOpenRound={onOpenRound}
      />
    );
  }

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{season ? seasonLabel(season) : t("Toutes les saisons", "All seasons")}</span>
        <h1 className="title">Maps</h1>
      </div>

      <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />

      {error && !maps && <p className="form-error">{error}</p>}

      {!maps ? (
        <div className="empty">{t("Chargement de tes maps...", "Loading your maps...")}</div>
      ) : maps.length === 0 ? (
        <div className="empty">{t("Aucun match compétitif synchronisé sur cette période.", "No competitive matches synced for this period.")}</div>
      ) : (
        <>
          <div className="mapstat-grid" role="group" aria-label={t("Maps jouées", "Maps played")}>
            {maps.map((map) => (
              <button
                key={map.mapId}
                type="button"
                className="mapstat-card"
                aria-label={t(`Ouvrir ${map.name}`, `Open ${map.name}`)}
                onPointerEnter={() => warm(map.mapId)}
                onFocus={() => warm(map.mapId)}
                onClick={() => choose(map.mapId)}
              >
                <Art src={map.splash ?? mapArt(map.mapId, "splash")} width={380} height={256} alt="" className="mapstat-card-art" />
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

          <section className="stack" style={{ gap: 20 }}>
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="section-title">{t("Tes meilleures et pires maps", "Your best and worst maps")}</h2>
              <span className="hint">
                {t(
                  `Classement par taux de victoire, maps jouées au moins ${MIN_RANKED} fois.`,
                  `Ranked by win rate, maps played at least ${MIN_RANKED} times.`,
                )}
              </span>
            </div>
            {ranking.count < 2 ? (
              <div className="empty">
                {t(
                  `Pas assez de maps jouées au moins ${MIN_RANKED} fois sur cette période.`,
                  `Not enough maps played at least ${MIN_RANKED} times in this period.`,
                )}
              </div>
            ) : (
              <div className="mapstat-ranking">
                <RankList title={t("Meilleures", "Best")} maps={ranking.best} onSelect={choose} onWarm={warm} />
                <RankList title={t("Pires", "Worst")} maps={ranking.worst} onSelect={choose} onWarm={warm} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

type MapViewProps = {
  puuid: string;
  map: MapStat;
  season: string | null;
  onBack: () => void;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
};

function MapView({ puuid, map, season, onBack, onOpenRound }: MapViewProps) {
  const [tab, setTab] = useState<Tab>("history");
  const history = useQuery(queries.mapHistory(puuid, map.mapId));

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "history", label: t("Zones et historique", "Zones and history") },
    { id: "stats", label: t("Rounds et sites", "Rounds and sites") },
  ];

  return (
    <div className="content mapview">
      <button type="button" className="back-btn" onClick={onBack}>
        <Icon name="arrowRight" size={16} strokeWidth={2} className="flip" />
        {t("Toutes les maps", "All maps")}
      </button>

      <header className="mapstat-hero mapview-hero">
        <Art src={map.splash ?? mapArt(map.mapId, "splash")} width={1280} height={720} alt="" className="mapstat-hero-art" eager />
        <div className="mapstat-hero-text">
          <span className="mapstat-hero-eyebrow">
            {season ? seasonLabel(season) : t("Toutes les saisons", "All seasons")}, {matchCount(map.matches)}, {record(map)}
          </span>
          <h1 className="mapstat-hero-title">{map.name}</h1>
        </div>
        <div className="mapstat-hero-pct">
          <span className={`mapstat-hero-value ${tone(map.winPct)}`}>{pct(map.winPct, 0)}</span>
          <span className="mapstat-hero-label">{t("de victoires", "win rate")}</span>
        </div>
      </header>

      <div className="row between wrap" style={{ gap: 16 }}>
        <div className="segmented" role="tablist" aria-label={t(`Sections de ${map.name}`, `${map.name} sections`)}>
          {tabs.map((item) => (
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
        <div className="mapview-figures">
          <Figure label={t("RR net", "Net RR")} value={map.rrMatches > 0 ? signed(map.rrNet) : "0"} className={rrTone(map.rrNet)} />
          <Figure label="ACS" value={fmt(map.acs)} />
          <Figure label="K/D" value={fmt(map.kd, 2)} />
          <Figure label="ADR" value={fmt(map.adr)} />
          <Figure label="HS" value={pct(map.hsPct)} />
        </div>
      </div>

      {tab === "stats" && <MapDetail map={map} />}
      {tab === "history" &&
        (history.data ? (
          <MapHistoryView history={history.data} mapName={map.name} season={season} onOpenRound={onOpenRound} />
        ) : history.error ? (
          <p className="form-error">{history.error}</p>
        ) : (
          <div className="empty">{t("Chargement de l'historique...", "Loading the history...")}</div>
        ))}
    </div>
  );
}

function MapDetail({ map }: { map: MapStat }) {
  const attack = rate(map.attackWon, map.attackPlayed);
  const defense = rate(map.defenseWon, map.defensePlayed);
  const pistol = rate(map.pistolWon, map.pistolPlayed);
  const retakes = rate(map.retakesWon, map.retakesPlayed);
  const topSite = Math.max(1, ...map.plantSites.map((site) => site.plants));
  const sitePlants = map.plantSites.reduce((sum, site) => sum + site.plants, 0);
  const icon = agentIcon(map.agentId);

  return (
    <section className="mapstat-detail" aria-label={t(`Statistiques sur ${map.name}`, `Stats on ${map.name}`)}>
      {map.analyzed < map.matches && (
        <span className="hint">
          {t(
            `Détail des rounds calculé sur ${map.analyzed} des ${map.matches} matchs, les autres n'ont pas de données de rounds.`,
            `Round breakdown based on ${map.analyzed} of ${map.matches} matches, the others have no round data.`,
          )}
        </span>
      )}

      <div className="mapstat-panels">
        <div className="panel stack mapstat-panel">
          <h3 className="mapstat-panel-title">{t("Attaque et défense", "Attack and defense")}</h3>
          <SideBar label={t("Attaque", "Attack")} won={map.attackWon} played={map.attackPlayed} value={attack} />
          <SideBar label={t("Défense", "Defense")} won={map.defenseWon} played={map.defensePlayed} value={defense} />
        </div>

        <div className="panel stack mapstat-panel">
          <h3 className="mapstat-panel-title">{t("Plants par site", "Plants by site")}</h3>
          <span className="hint">
            {t(
              `${map.plants} ${map.plants > 1 ? "plants" : "plant"} en attaque sur ${roundCount(map.attackPlayed)}, soit ${pct(rate(map.plants, map.attackPlayed), 0)} des rounds.`,
              `${map.plants} ${map.plants === 1 ? "plant" : "plants"} on attack over ${roundCount(map.attackPlayed)}, ${pct(rate(map.plants, map.attackPlayed), 0)} of rounds.`,
            )}
          </span>
          {map.plantSites.length === 0 ? (
            <span className="faint">{t("Aucun plant enregistré sur cette map.", "No plants recorded on this map.")}</span>
          ) : (
            <div className="mapstat-plants">
              <div className="mapstat-sites" role="img" aria-label={t("Répartition des plants par site", "Plants split by site")}>
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
              {map.minimap && map.plantSpots.length > 0 && <PlantMap map={map} />}
            </div>
          )}
        </div>

        <div className="panel stack mapstat-panel">
          <h3 className="mapstat-panel-title">{t("Rounds pistol", "Pistol rounds")}</h3>
          <span className={`mapstat-panel-value ${map.pistolPlayed ? tone(pistol) : "muted"}`}>
            {map.pistolWon}
            <span className="faint"> / {map.pistolPlayed}</span>
          </span>
          <span className="bar mapstat-bar">
            <span className={map.pistolPlayed ? tone(pistol) : ""} style={{ width: `${pistol}%` }} />
          </span>
          <span className="hint">
            {t(`${pct(pistol, 0)} de rounds 1 et 13 gagnés.`, `${pct(pistol, 0)} of rounds 1 and 13 won.`)}
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
            {t(`${pct(retakes, 0)} des rounds en défense gagnés après un plant adverse.`, `${pct(retakes, 0)} of defense rounds won after an enemy plant.`)}
          </span>
        </div>

        <div className="panel mapstat-panel mapstat-agent">
          <h3 className="mapstat-panel-title">{t("Agent le plus joué", "Most played agent")}</h3>
          {map.agentId ? (
            <div className="row" style={{ gap: 16 }}>
              <Art src={icon} width={64} height={64} alt={map.agentName ?? ""} className="mapstat-agent-icon" />
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong className="mapstat-agent-name">{map.agentName ?? t("Agent inconnu", "Unknown agent")}</strong>
                <span className="muted">
                  {t(`${matchCount(map.agentMatches)} sur ${map.matches},`, `${matchCount(map.agentMatches)} of ${map.matches},`)}{" "}
                  <span className={tone(rate(map.agentWins, map.agentMatches))}>
                    {t(`${pct(rate(map.agentWins, map.agentMatches), 0)} de victoires`, `${pct(rate(map.agentWins, map.agentMatches), 0)} win rate`)}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <span className="faint">{t("Aucun agent enregistré.", "No agent recorded.")}</span>
          )}
        </div>
      </div>
    </section>
  );
}

function PlantMap({ map }: { map: MapStat }) {
  const won = map.plantSpots.filter((spot) => spot.won).length;
  return (
    <figure className="mapstat-plantmap">
      <div className="mapstat-minimap">
        <span className="mapstat-minimap-turn" style={rotationStyle(map.rotation)}>
          <Art src={map.minimap ?? undefined} width={240} height={240} alt={t(`Minimap de ${map.name}`, `${map.name} minimap`)} className="mapstat-minimap-art" />
        </span>
        {map.plantSpots.map((spot, index) => {
          const point = rotatePoint(spot, map.rotation);
          return (
            <i
              key={index}
              className={`mapstat-plant-dot ${spot.won ? "win" : "bad"}`}
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            />
          );
        })}
      </div>
      <figcaption className="mapstat-plant-legend">
        <span>
          <i className="mapstat-plant-dot win" />
          {t(`${won} gagnés`, `${won} won`)}
        </span>
        <span>
          <i className="mapstat-plant-dot bad" />
          {t(`${map.plantSpots.length - won} perdus`, `${map.plantSpots.length - won} lost`)}
        </span>
      </figcaption>
    </figure>
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

function RankList({ title, maps, onSelect, onWarm }: { title: string; maps: MapStat[]; onSelect: (id: string) => void; onWarm: (id: string) => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="label">{title}</span>
      {maps.map((map) => (
        <button key={map.mapId} type="button" className="mapstat-rank" onPointerEnter={() => onWarm(map.mapId)} onClick={() => onSelect(map.mapId)}>
          <Art src={map.listIcon ?? mapArt(map.mapId, "listviewicon")} width={120} height={40} alt="" className="mapstat-rank-thumb" />
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
