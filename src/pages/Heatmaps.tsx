import "../styles/heatmap.css";
import { useEffect, useMemo, useState } from "react";
import { SeasonPicker } from "../components/SeasonPicker";
import { api, errorMessage, type Account, type HeatPoint, type Heatmap } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { pct } from "../lib/format";
import { rotatePoint, rotationStyle } from "../lib/minimap";

type Layer = HeatPoint["kind"];
type Side = "all" | "attack" | "defense";
type Phase = "all" | HeatPoint["phase"];

const LAYERS: { id: Layer; label: string; unit: string; color: string }[] = [
  { id: "death", label: "Mes morts", unit: "morts", color: "255, 138, 76" },
  { id: "kill", label: "Mes kills", unit: "kills", color: "94, 168, 255" },
  { id: "killer", label: "Mes tueurs", unit: "positions de tueurs", color: "233, 196, 106" },
];

const SIDES: { id: Side; label: string }[] = [
  { id: "all", label: "Tous les côtés" },
  { id: "attack", label: "Attaque" },
  { id: "defense", label: "Défense" },
];

const PHASES: { id: Phase; label: string }[] = [
  { id: "all", label: "Tout le round" },
  { id: "early", label: "Début" },
  { id: "mid", label: "Milieu" },
  { id: "post", label: "Après le plant" },
];

type Result = "all" | "win" | "loss";

const RESULTS: { id: Result; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "win", label: "Victoires" },
  { id: "loss", label: "Défaites" },
];

const matchCount = (count: number) => `${count} ${count > 1 ? "matchs" : "match"}`;

function summary(
  season: string | null | undefined,
  data: Heatmap | null,
  agentId: string | null,
  result: Result,
  limit: number | null,
) {
  const parts = [season ? seasonLabel(season) : "Toutes les saisons"];
  parts.push(data?.agents.find((agent) => agent.id === agentId)?.name ?? "tous les agents");
  if (result !== "all") parts.push(result === "win" ? "victoires" : "défaites");
  parts.push(limit ? `${limit} derniers matchs` : "tous les matchs");
  return parts.join(", ");
}
const clamp = (value: number) => Math.min(0.92, Math.max(0.08, value));

type Props = {
  account: Account;
  refreshKey: number;
};

export function Heatmaps({ account, refreshKey }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(undefined);
  const [mapId, setMapId] = useState<string | null>(null);
  const [data, setData] = useState<Heatmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("death");
  const [side, setSide] = useState<Side>("all");
  const [phase, setPhase] = useState<Phase>("all");
  const [zone, setZone] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [result, setResult] = useState<Result>("all");
  const [limit, setLimit] = useState<number | null>(null);
  const [limitDraft, setLimitDraft] = useState<number | null>(null);

  useEffect(() => {
    api
      .getSeasons(account.puuid)
      .then((list) => setSeason((current) => (current === undefined ? (list[0]?.short ?? null) : current)))
      .catch(() => setSeason(null));
  }, [account.puuid]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLimit(limitDraft), 250);
    return () => window.clearTimeout(timer);
  }, [limitDraft]);

  useEffect(() => {
    if (season === undefined) return;
    setError(null);
    api
      .getHeatmap(account.puuid, { mapId, season, agentId, limit })
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [account.puuid, mapId, season, agentId, limit, refreshKey]);

  useEffect(() => {
    setZone(null);
  }, [mapId, season, layer, side, phase, agentId, result, limit, data?.mapId]);

  const resetAdvanced = () => {
    setAgentId(null);
    setResult("all");
    setLimitDraft(null);
  };

  const changeMap = (id: string) => {
    setMapId(id);
    setAgentId(null);
    setLimitDraft(null);
  };

  const activeFilters = [agentId !== null, result !== "all", limit !== null].filter(Boolean).length;
  const available = data?.available ?? 0;

  const style = LAYERS.find((item) => item.id === layer) ?? LAYERS[0];
  const rotation = data?.rotation ?? 0;
  const points = useMemo(
    () =>
      (data?.points ?? [])
        .filter(
          (point) =>
            point.kind === layer &&
            (side === "all" || point.attack === (side === "attack")) &&
            (phase === "all" || point.phase === phase) &&
            (result === "all" || point.won === (result === "win")),
        )
        .map((point) => ({ ...point, ...rotatePoint(point, rotation) })),
    [data, layer, side, phase, result, rotation],
  );
  const zones = useMemo(() => {
    const counts = new Map<string, number>();
    points.forEach((point) => {
      if (point.zone) counts.set(point.zone, (counts.get(point.zone) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [points]);
  const zoneLabel = useMemo(() => {
    if (!zone) return null;
    const inZone = points.filter((point) => point.zone === zone);
    if (inZone.length === 0) return null;
    const x = inZone.reduce((sum, point) => sum + point.x, 0) / inZone.length;
    const y = inZone.reduce((sum, point) => sum + point.y, 0) / inZone.length;
    return { x: clamp(x), y: clamp(y) };
  }, [points, zone]);
  const top = zones[0]?.[1] ?? 1;
  const selectedMap = data?.maps.find((map) => map.id === data.mapId);
  const mapName = selectedMap?.name ?? "Heatmaps";
  const splash = data?.splash ?? selectedMap?.image ?? null;
  const pointClass = (base: string, pointZone: string | null) => (zone && pointZone === zone ? `${base} in-zone` : base);

  return (
    <div className="content">
      <header className="heat-banner">
        {splash && <img src={splash} alt="" />}
        <div className="heat-banner-text">
          <span className="heat-banner-eyebrow">Heatmaps</span>
          <h1 className="heat-banner-title">{mapName}</h1>
          <span className="heat-banner-sub">{matchCount(data?.matches ?? 0)}</span>
        </div>
      </header>

      <div className="row wrap between">
        <span className="muted">{summary(season, data, agentId, result, limit)}</span>
        <button
          type="button"
          className={`btn ${advanced ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setAdvanced(!advanced)}
          aria-expanded={advanced}
        >
          Filtres avancés{activeFilters > 0 ? ` (${activeFilters})` : ""}
        </button>
      </div>

      {advanced && (
        <section className="advanced-filters" aria-label="Filtres avancés">
          <div className="filter-block">
            <span className="label">Acte</span>
            <SeasonPicker
              puuid={account.puuid}
              value={season}
              onChange={(next) => {
                setSeason(next);
                setMapId(null);
                setAgentId(null);
                setLimitDraft(null);
              }}
            />
          </div>
          <div className="filter-block">
            <span className="label">Agent</span>
            <div className="chips" role="group" aria-label="Agent">
              <button type="button" className={`chip${agentId === null ? " active" : ""}`} onClick={() => setAgentId(null)}>
                Tous les agents
              </button>
              {data?.agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`chip agent-chip${agentId === agent.id ? " active" : ""}`}
                  onClick={() => setAgentId(agent.id)}
                >
                  {agentIcon(agent.id) && <img src={agentIcon(agent.id)} alt="" />}
                  {agent.name} <span className="chip-count">{agent.matches}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 24 }}>
            <div className="filter-block">
              <span className="label">Résultat</span>
              <Segmented label="Résultat" options={RESULTS} value={result} onChange={setResult} />
            </div>
          </div>
          {available > 1 && (
            <div className="filter-block">
              <label className="label" htmlFor="heat-limit">
                Matchs pris en compte : {limitDraft === null ? `tous (${available})` : `les ${limitDraft} derniers`}
              </label>
              <input
                id="heat-limit"
                className="range"
                type="range"
                min={1}
                max={available}
                value={limitDraft ?? available}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setLimitDraft(next >= available ? null : next);
                }}
              />
            </div>
          )}
          {activeFilters > 0 && (
            <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={resetAdvanced}>
              Réinitialiser
            </button>
          )}
        </section>
      )}

      {error && <p className="form-error">{error}</p>}

      {data && data.maps.length === 0 ? (
        <div className="empty">Aucun match synchronisé sur cette période.</div>
      ) : (
        <>
          <div className="stack" style={{ gap: 16 }}>
            <div className="map-cards" role="group" aria-label="Map">
              {data?.maps.map((map) => (
                <button
                  key={map.id}
                  type="button"
                  className={`map-card${data.mapId === map.id ? " active" : ""}`}
                  aria-pressed={data.mapId === map.id}
                  onClick={() => changeMap(map.id)}
                >
                  {map.image && <img src={map.image} alt="" />}
                  <span className="map-card-text">
                    <strong>{map.name}</strong>
                    <span>{matchCount(map.matches)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="row wrap">
              <Segmented label="Afficher" options={LAYERS} value={layer} onChange={setLayer} />
              <Segmented label="Côté" options={SIDES} value={side} onChange={setSide} />
              <Segmented label="Moment" options={PHASES} value={phase} onChange={setPhase} />
            </div>
          </div>

          <div className="review">
            <div className={`minimap${zone ? " has-focus" : ""}`}>
              {data?.minimap && <img src={data.minimap} alt={`Minimap de ${mapName}`} style={rotationStyle(rotation)} />}
              {points.map((point, i) => (
                <span
                  key={`b${i}`}
                  className={pointClass("heat-blob", point.zone)}
                  style={{
                    left: `${point.x * 100}%`,
                    top: `${point.y * 100}%`,
                    background: `radial-gradient(circle, rgba(${style.color}, 0.55) 0%, rgba(${style.color}, 0) 70%)`,
                  }}
                />
              ))}
              {points.map((point, i) => (
                <span
                  key={`d${i}`}
                  className={pointClass("heat-dot", point.zone)}
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: `rgb(${style.color})` }}
                />
              ))}
              {zone && zoneLabel && (
                <span className="zone-pill" style={{ left: `${zoneLabel.x * 100}%`, top: `${zoneLabel.y * 100}%` }}>
                  {zone}
                </span>
              )}
              {data && !data.minimap && <span className="minimap-empty">Minimap indisponible, relance une synchro</span>}
            </div>

            <div className="stack" style={{ gap: 24 }}>
              <div className="stack" style={{ gap: 4 }}>
                <span className="big-number">{points.length}</span>
                <span className="muted">{style.unit} avec ces filtres</span>
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", paddingBottom: 6 }}>Par zone</span>
                {zones.length === 0 && <span className="faint">Rien à afficher avec ces filtres.</span>}
                {zones.map(([name, count]) => (
                  <button
                    type="button"
                    className={`zone-row zone-button${zone === name ? " active" : ""}`}
                    key={name}
                    aria-pressed={zone === name}
                    onClick={() => setZone((current) => (current === name ? null : name))}
                  >
                    <span className="row between">
                      <span style={{ fontWeight: 500 }}>{name}</span>
                      <span>
                        <strong>{count}</strong> <span className="faint">{pct((count * 100) / points.length, 0)}</span>
                      </span>
                    </span>
                    <span className="bar">
                      <span style={{ width: `${(count / top) * 100}%`, background: `rgb(${style.color})` }} />
                    </span>
                  </button>
                ))}
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                Zones nommées d'après les callouts officiels de la map. Clique sur une zone pour la mettre en avant.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" className={value === option.id ? "active" : undefined} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
