import { useEffect, useMemo, useState } from "react";
import { SeasonPicker } from "../components/SeasonPicker";
import { api, errorMessage, type Account, type HeatPoint, type Heatmap } from "../lib/api";
import { pct } from "../lib/format";

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

  useEffect(() => {
    if (season === undefined) return;
    setError(null);
    api
      .getHeatmap(account.puuid, mapId, season)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [account.puuid, mapId, season, refreshKey]);

  const style = LAYERS.find((item) => item.id === layer) ?? LAYERS[0];
  const points = useMemo(
    () =>
      (data?.points ?? []).filter(
        (point) =>
          point.kind === layer &&
          (side === "all" || point.attack === (side === "attack")) &&
          (phase === "all" || point.phase === phase),
      ),
    [data, layer, side, phase],
  );
  const zones = useMemo(() => {
    const counts = new Map<string, number>();
    points.forEach((point) => {
      if (point.zone) counts.set(point.zone, (counts.get(point.zone) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [points]);
  const top = zones[0]?.[1] ?? 1;
  const mapName = data?.maps.find((map) => map.id === data.mapId)?.name ?? "Heatmaps";

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">Heatmaps, {data?.matches ?? 0} matchs</span>
        <h1 className="title">{mapName}</h1>
      </div>

      <SeasonPicker puuid={account.puuid} value={season} onChange={(next) => { setSeason(next); setMapId(null); }} />

      {error && <p className="form-error">{error}</p>}

      {data && data.maps.length === 0 ? (
        <div className="empty">Aucun match synchronisé sur cette période.</div>
      ) : (
        <>
          <div className="stack" style={{ gap: 12 }}>
            <div className="chips" role="group" aria-label="Map">
              {data?.maps.map((map) => (
                <button key={map.id} type="button" className={`chip${data.mapId === map.id ? " active" : ""}`} onClick={() => setMapId(map.id)}>
                  {map.name} <span className="chip-count">{map.matches}</span>
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
            <div className="minimap">
              {data?.minimap && <img src={data.minimap} alt={`Minimap de ${mapName}`} />}
              {points.map((point, i) => (
                <span
                  key={`b${i}`}
                  className="heat-blob"
                  style={{
                    left: `${point.x * 100}%`,
                    top: `${point.y * 100}%`,
                    background: `radial-gradient(circle, rgba(${style.color}, 0.55) 0%, rgba(${style.color}, 0) 70%)`,
                  }}
                />
              ))}
              {points.map((point, i) => (
                <span key={`d${i}`} className="heat-dot" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: `rgb(${style.color})` }} />
              ))}
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
                {zones.map(([zone, count]) => (
                  <div className="zone-row" key={zone}>
                    <div className="row between">
                      <span style={{ fontWeight: 500 }}>{zone}</span>
                      <span>
                        <strong>{count}</strong> <span className="faint">{pct((count * 100) / points.length, 0)}</span>
                      </span>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${(count / top) * 100}%`, background: `rgb(${style.color})` }} />
                    </div>
                  </div>
                ))}
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                Zones nommées d'après les callouts officiels de la map.
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
