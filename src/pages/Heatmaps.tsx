import "../styles/heatmap.css";
import { useEffect, useMemo, useState } from "react";
import { ThumbArt } from "../components/GameArt";
import { PointCanvas } from "../components/PointCanvas";
import { SeasonPicker } from "../components/SeasonPicker";
import type { Account, HeatPoint, Heatmap } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { pct } from "../lib/format";
import { rotatePoint, rotationStyle } from "../lib/minimap";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { defaultSeason, queries } from "../lib/queries";

type Layer = HeatPoint["kind"];
type Side = "all" | "attack" | "defense";
type Phase = "all" | HeatPoint["phase"];

const layerOptions = (): { id: Layer; label: string; unit: string; color: string }[] => [
  { id: "death", label: t("Mes morts", "My deaths"), unit: t("morts", "deaths"), color: "255, 138, 76" },
  { id: "kill", label: t("Mes kills", "My kills"), unit: "kills", color: "94, 168, 255" },
  { id: "killer", label: t("Mes tueurs", "My killers"), unit: t("positions de tueurs", "killer positions"), color: "233, 196, 106" },
];

const sideOptions = (): { id: Side; label: string }[] => [
  { id: "all", label: t("Tous les côtés", "Both sides") },
  { id: "attack", label: t("Attaque", "Attack") },
  { id: "defense", label: t("Défense", "Defense") },
];

const phaseOptions = (): { id: Phase; label: string }[] => [
  { id: "all", label: t("Tout le round", "Whole round") },
  { id: "early", label: t("Début", "Early") },
  { id: "mid", label: t("Milieu", "Mid") },
  { id: "post", label: t("Après le plant", "Post-plant") },
];

type Result = "all" | "win" | "loss";

const resultOptions = (): { id: Result; label: string }[] => [
  { id: "all", label: t("Tous", "All") },
  { id: "win", label: t("Victoires", "Wins") },
  { id: "loss", label: t("Défaites", "Losses") },
];

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

function summary(
  season: string | null | undefined,
  data: Heatmap | null,
  agentId: string | null,
  result: Result,
  limit: number | null,
) {
  const parts = [season ? seasonLabel(season) : t("Toutes les saisons", "All seasons")];
  parts.push(data?.agents.find((agent) => agent.id === agentId)?.name ?? t("tous les agents", "all agents"));
  if (result !== "all") parts.push(result === "win" ? t("victoires", "wins") : t("défaites", "losses"));
  parts.push(limit ? t(`${limit} derniers matchs`, `last ${limit === 1 ? "match" : `${limit} matches`}`) : t("tous les matchs", "all matches"));
  return parts.join(", ");
}
const clamp = (value: number) => Math.min(0.92, Math.max(0.08, value));

type Props = {
  account: Account;
  refreshKey: number;
};

export function Heatmaps({ account }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const [mapId, setMapId] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("death");
  const [side, setSide] = useState<Side>("all");
  const [phase, setPhase] = useState<Phase>("all");
  const [zone, setZone] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [result, setResult] = useState<Result>("all");
  const [limit, setLimit] = useState<number | null>(null);
  const [limitDraft, setLimitDraft] = useState<number | null>(null);

  const seasons = useQuery(queries.seasons(account.puuid));

  useEffect(() => {
    if (season === undefined && seasons.data) setSeason(seasons.data[0]?.short ?? null);
    if (season === undefined && seasons.error) setSeason(null);
  }, [season, seasons.data, seasons.error]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLimit(limitDraft), 250);
    return () => window.clearTimeout(timer);
  }, [limitDraft]);

  const query = useQuery(season === undefined ? null : queries.heatmap(account.puuid, { mapId, season, agentId, limit }));
  const data = query.data ?? null;
  const error = query.error;

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

  const layers = layerOptions();
  const style = layers.find((item) => item.id === layer) ?? layers[0];
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

  return (
    <div className="content heatmaps">
      <header className="page-head">
        <div className="page-head-title">
          <h1 className="title">Heatmaps</h1>
          <span className="faint">{summary(season, data, agentId, result, limit)}</span>
        </div>
        <button
          type="button"
          className={`btn ${advanced ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setAdvanced(!advanced)}
          aria-expanded={advanced}
        >
          {t("Filtres avancés", "Advanced filters")}
          {activeFilters > 0 ? ` (${activeFilters})` : ""}
        </button>
      </header>

      {advanced && (
        <section className="advanced-filters" aria-label={t("Filtres avancés", "Advanced filters")}>
          <div className="filter-block">
            <span className="label">{t("Acte", "Act")}</span>
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
          <div className="filter-block wide">
            <span className="label">Agent</span>
            <div className="chips" role="group" aria-label="Agent">
              <button type="button" className={`chip${agentId === null ? " active" : ""}`} onClick={() => setAgentId(null)}>
                {t("Tous les agents", "All agents")}
              </button>
              {data?.agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`chip agent-chip${agentId === agent.id ? " active" : ""}`}
                  onClick={() => setAgentId(agent.id)}
                >
                  {agentIcon(agent.id) && <img src={agentIcon(agent.id)} alt="" width={22} height={22} loading="lazy" decoding="async" />}
                  {agent.name} <span className="chip-count">{agent.matches}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 24 }}>
            <div className="filter-block">
              <span className="label">{t("Résultat", "Result")}</span>
              <Segmented label={t("Résultat", "Result")} options={resultOptions()} value={result} onChange={setResult} />
            </div>
          </div>
          {available > 1 && (
            <div className="filter-block">
              <label className="label" htmlFor="heat-limit">
                {t(
                  `Matchs sur ${mapName} pris en compte : ${limitDraft === null ? `tous (${available})` : `les ${limitDraft} derniers`}`,
                  `Matches on ${mapName} included: ${limitDraft === null ? `all (${available})` : `last ${limitDraft}`}`,
                )}
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
              {t("Réinitialiser", "Reset")}
            </button>
          )}
        </section>
      )}

      {error && <p className="form-error">{error}</p>}

      {data && data.maps.length === 0 ? (
        <div className="empty">{t("Aucun match synchronisé sur cette période.", "No matches synced for this period.")}</div>
      ) : (
        <>
          <div className="map-cards" role="group" aria-label="Map">
            {data?.maps.map((map) => (
              <button
                key={map.id}
                type="button"
                className={`map-card${data.mapId === map.id ? " active" : ""}`}
                aria-pressed={data.mapId === map.id}
                onClick={() => changeMap(map.id)}
              >
                <ThumbArt src={map.image ?? undefined} width={256} height={64} alt="" fallback={null} />
                <span className="map-card-text">
                  <strong>{map.name}</strong>
                  <span>{matchCount(map.matches)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="review heat-layout">
            <div className={`minimap${zone ? " has-focus" : ""}`}>
              {data?.minimap && <img src={data.minimap} alt={t(`Minimap de ${mapName}`, `${mapName} minimap`)} width={1024} height={1024} decoding="async" style={rotationStyle(rotation)} />}
              <PointCanvas points={points} focus={zone} color={`rgb(${style.color})`} glow={style.color} focusScale={1.8} ring />
              {zone && zoneLabel && (
                <span className="zone-pill" style={{ left: `${zoneLabel.x * 100}%`, top: `${zoneLabel.y * 100}%` }}>
                  {zone}
                </span>
              )}
              {data && !data.minimap && <span className="minimap-empty">{t("Minimap indisponible, relance une synchro", "Minimap unavailable, run a sync again")}</span>}
            </div>

            <div className="stack" style={{ gap: 14 }}>
              <div className="heat-controls">
                <Segmented label={t("Afficher", "Show")} options={layers} value={layer} onChange={setLayer} />
                <Segmented label={t("Côté", "Side")} options={sideOptions()} value={side} onChange={setSide} />
                <Segmented label={t("Moment", "Timing")} options={phaseOptions()} value={phase} onChange={setPhase} />
              </div>
              <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
                <span className="heat-count">{points.length}</span>
                <span className="muted">{t(`${style.unit} avec ces filtres`, `${style.unit} with these filters`)}</span>
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", paddingBottom: 4 }}>
                  {t("Par zone", "By zone")}
                </span>
                {zones.length === 0 && <span className="faint">{t("Rien à afficher avec ces filtres.", "Nothing to show with these filters.")}</span>}
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
                {t(
                  "Zones nommées d'après les callouts officiels de la map. Clique sur une zone pour la mettre en avant.",
                  "Zones are named after the map's official callouts. Click a zone to highlight it.",
                )}
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
