import "../styles/weapons.css";
import { useEffect, useMemo, useState } from "react";
import { SeasonPicker } from "../components/SeasonPicker";
import { errorMessage, type Account } from "../lib/api";
import { seasonLabel } from "../lib/assets";
import { fmt, pct } from "../lib/format";
import {
  getWeaponStats,
  RANGES,
  rangeTotal,
  weaponCategory,
  type KillerLine,
  type RangeSplit,
  type WeaponLine,
  type WeaponReport,
} from "../lib/weapons";

type Props = {
  account: Account;
  refreshKey: number;
};

const KILLER_LIMIT = 8;

const meters = (value: number | null) => (value === null ? "-" : `${fmt(value, 1)} m`);
const plural = (count: number, one: string, many: string) => `${fmt(count)} ${count > 1 ? many : one}`;

export function Weapons({ account, refreshKey }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<WeaponReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (season === undefined) return;
    let alive = true;
    setError(null);
    getWeaponStats(account.puuid, season)
      .then((report) => {
        if (alive) setData(report);
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [account.puuid, season, refreshKey]);

  const weapon = useMemo(
    () => data?.weapons.find((item) => item.name === selected) ?? data?.weapons[0] ?? null,
    [data, selected],
  );

  const overall = useMemo(() => {
    if (!data) return null;
    let total = 0;
    let measured = 0;
    data.weapons.forEach((item) => {
      const count = rangeTotal(item.killRanges);
      if (item.avgKillDistance !== null && count > 0) {
        total += item.avgKillDistance * count;
        measured += count;
      }
    });
    return measured > 0 ? total / measured : null;
  }, [data]);

  const topKills = Math.max(1, ...(data?.weapons.map((item) => item.kills) ?? [0]));
  const killers = data?.killers.slice(0, KILLER_LIMIT) ?? [];
  const topDeaths = Math.max(1, ...killers.map((item) => item.deaths));
  const favorite = data?.weapons.find((item) => !item.ability && item.kills > 0) ?? null;
  const empty = data !== null && data.kills === 0 && data.weapons.length === 0 && data.killers.length === 0;

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{season ? seasonLabel(season) : "Toutes les saisons"}</span>
        <h1 className="title">Armes</h1>
      </div>

      <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />

      {error && <p className="form-error">{error}</p>}

      {!data ? (
        !error && <div className="empty">Chargement de tes armes...</div>
      ) : empty ? (
        <div className="empty">
          {data.matches === 0
            ? "Aucun match compétitif synchronisé sur cette période."
            : "Aucun kill enregistré sur cette période."}
        </div>
      ) : (
        <>
          <section className="weapons-summary">
            <div className="stack" style={{ gap: 18 }}>
              <div className="stack" style={{ gap: 8 }}>
                <span className="big-number">{fmt(data.kills)}</span>
                <span className="muted">kills sur {plural(data.matches, "match", "matchs")}</span>
              </div>
              <div className="weapons-facts">
                <div className="stack" style={{ gap: 2 }}>
                  <span className="label">Arme principale</span>
                  <span className="weapons-fact">{favorite ? favorite.name : "-"}</span>
                  {favorite && <span className="faint weapons-fact-sub">{pct(favorite.killShare)} des kills</span>}
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <span className="label">Distance moyenne</span>
                  <span className="weapons-fact">{meters(overall)}</span>
                  <span className="faint weapons-fact-sub">entre toi et ta cible</span>
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <span className="label">Morts subies</span>
                  <span className="weapons-fact">{fmt(data.deaths)}</span>
                  <span className="faint weapons-fact-sub">par un adversaire</span>
                </div>
              </div>
            </div>
            <BodySplit report={data} />
          </section>

          {data.weapons.length > 0 && (
            <section className="stack" style={{ gap: 16 }}>
              <h2 className="section-title">Ton arsenal</h2>
              <div className="weapons-wrap">
                <div className="weapons-layout">
                  <div className="weapons-table" role="list">
                    <div className="weapon-row head" aria-hidden="true">
                      <span>Arme</span>
                      <span>Kills</span>
                      <span className="weapon-col-share">Part</span>
                      <span className="weapon-col-hs">HS</span>
                      <span className="weapon-col-dist">Distance</span>
                      <span>K/round</span>
                    </div>
                    {data.weapons.map((item) => {
                      const active = weapon?.name === item.name;
                      return (
                        <div role="listitem" key={item.name}>
                          <button
                            type="button"
                            className={`weapon-row${active ? " active" : ""}`}
                            aria-pressed={active}
                            onClick={() => setSelected(item.name)}
                          >
                            <span className="weapon-name">
                              <strong>{item.name}</strong>
                              <span className="faint">{weaponCategory(item.name)}</span>
                            </span>
                            <span className="weapon-kills">
                              <strong>{fmt(item.kills)}</strong>
                              <span className="bar">
                                <span style={{ width: `${(item.kills / topKills) * 100}%` }} />
                              </span>
                            </span>
                            <span className="weapon-col-share">{pct(item.killShare)}</span>
                            <span className="weapon-col-hs">{item.hsPct === null ? "-" : pct(item.hsPct, 0)}</span>
                            <span className="weapon-col-dist">{meters(item.avgKillDistance)}</span>
                            <span>{item.killsPerRoundHeld === null ? "-" : fmt(item.killsPerRoundHeld, 2)}</span>
                          </button>
                          {active && (
                            <div className="weapon-inline">
                              <WeaponDetail weapon={item} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {weapon && (
                    <aside className="weapons-side panel" aria-label={`Détail ${weapon.name}`}>
                      <WeaponDetail weapon={weapon} />
                    </aside>
                  )}
                </div>
              </div>
              <span className="faint weapons-note">
                HS estimé à partir des tirs touchés pendant les rounds où l'arme était ton arme principale. K/round : kills
                par round où tu la portais.
              </span>
            </section>
          )}

          {killers.length > 0 && (
            <section className="stack" style={{ gap: 16 }}>
              <div className="row between wrap" style={{ alignItems: "baseline" }}>
                <h2 className="section-title">Ce qui te tue</h2>
                <RangeLegend />
              </div>
              <div className="killers-table" role="list">
                {killers.map((item) => (
                  <KillerRow
                    key={item.name}
                    killer={item}
                    top={topDeaths}
                    active={weapon?.name === item.name}
                    onSelect={data.weapons.some((entry) => entry.name === item.name) ? () => setSelected(item.name) : undefined}
                  />
                ))}
              </div>
              {data.killers.length > KILLER_LIMIT && (
                <span className="faint weapons-note">
                  {plural(data.killers.length - KILLER_LIMIT, "autre arme", "autres armes")} représentent{" "}
                  {pct(data.killers.slice(KILLER_LIMIT).reduce((sum, item) => sum + item.deathShare, 0))} de tes morts.
                </span>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BodySplit({ report }: { report: WeaponReport }) {
  const parts = [
    { id: "head", label: "Tête", value: report.hsPct, count: report.headshots },
    { id: "torso", label: "Corps", value: report.bodyPct, count: report.bodyshots },
    { id: "legs", label: "Jambes", value: report.legPct, count: report.legshots },
  ];
  const top = Math.max(1, ...parts.map((part) => part.value));
  const tone = (value: number) => `color-mix(in srgb, var(--accent) ${Math.round(18 + (value / top) * 82)}%, var(--field))`;
  const total = report.headshots + report.bodyshots + report.legshots;

  return (
    <div className="body-split" aria-label="Répartition des tirs touchés">
      {parts.map((part) => (
        <div className={`body-line body-${part.id}`} key={part.id}>
          <span className="body-slot" aria-hidden="true">
            {part.id === "legs" ? (
              <span className="body-legs-pair">
                <span className="body-part" style={{ background: tone(part.value) }} />
                <span className="body-part" style={{ background: tone(part.value) }} />
              </span>
            ) : (
              <span className="body-part" style={{ background: tone(part.value) }} />
            )}
          </span>
          <span className="stack" style={{ gap: 0 }}>
            <span className="body-value">{total > 0 ? pct(part.value) : "-"}</span>
            <span className="faint body-label">
              {part.label}, {plural(part.count, "tir", "tirs")}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RangeBars({ ranges, tone }: { ranges: RangeSplit; tone: "good" | "bad" }) {
  const total = rangeTotal(ranges);
  const top = Math.max(1, ranges.short, ranges.medium, ranges.long);
  return (
    <div className="stack" style={{ gap: 12 }}>
      {RANGES.map((range) => {
        const count = ranges[range.id];
        return (
          <div className="range-row" key={range.id}>
            <span className="row between">
              <span>
                <span style={{ fontWeight: 600 }}>{range.label}</span> <span className="faint">{range.detail}</span>
              </span>
              <span>
                <strong>{fmt(count)}</strong> <span className="faint">{total > 0 ? pct((count * 100) / total, 0) : "-"}</span>
              </span>
            </span>
            <span className={`bar range-bar is-${tone}`}>
              <span style={{ width: `${(count / top) * 100}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WeaponDetail({ weapon }: { weapon: WeaponLine }) {
  const measured = rangeTotal(weapon.killRanges);
  const figures = [
    { label: "Kills", value: fmt(weapon.kills) },
    { label: "Rounds portée", value: fmt(weapon.roundsHeld) },
    { label: "K/round", value: weapon.killsPerRoundHeld === null ? "-" : fmt(weapon.killsPerRoundHeld, 2) },
    { label: "HS estimé", value: weapon.hsPct === null ? "-" : pct(weapon.hsPct, 0) },
  ];

  return (
    <div className="weapon-detail">
      <div className="stack" style={{ gap: 4 }}>
        <span className="eyebrow">{weaponCategory(weapon.name)}</span>
        <h3 className="weapon-detail-title">{weapon.name}</h3>
      </div>

      <div className="weapon-figures">
        {figures.map((figure) => (
          <div className="stack" style={{ gap: 2 }} key={figure.label}>
            <span className="label">{figure.label}</span>
            <span className="weapon-figure">{figure.value}</span>
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <div className="row between wrap" style={{ alignItems: "baseline" }}>
          <span className="weapon-detail-sub">Distance de tes kills</span>
          <span className="faint" style={{ fontSize: 13 }}>
            moyenne {meters(weapon.avgKillDistance)}
          </span>
        </div>
        {measured > 0 ? (
          <RangeBars ranges={weapon.killRanges} tone="good" />
        ) : (
          <span className="faint">Aucune position enregistrée pour ces kills.</span>
        )}
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <div className="row between wrap" style={{ alignItems: "baseline" }}>
          <span className="weapon-detail-sub">Face à cette arme</span>
          <span className="faint" style={{ fontSize: 13 }}>
            {plural(weapon.deaths, "mort", "morts")}
            {weapon.avgDeathDistance !== null && `, moyenne ${meters(weapon.avgDeathDistance)}`}
          </span>
        </div>
        {rangeTotal(weapon.deathRanges) > 0 ? (
          <RangeBars ranges={weapon.deathRanges} tone="bad" />
        ) : (
          <span className="faint">Aucune mort subie avec cette arme.</span>
        )}
      </div>
    </div>
  );
}

function RangeLegend() {
  return (
    <span className="range-legend">
      {RANGES.map((range) => (
        <span key={range.id}>
          <i className={`range-dot range-${range.id}`} aria-hidden="true" />
          {range.label}
        </span>
      ))}
    </span>
  );
}

function KillerRow({
  killer,
  top,
  active,
  onSelect,
}: {
  killer: KillerLine;
  top: number;
  active: boolean;
  onSelect?: () => void;
}) {
  const total = rangeTotal(killer.ranges);
  const body = (
    <>
      <span className="weapon-name">
        <strong>{killer.name}</strong>
        <span className="faint">{weaponCategory(killer.name)}</span>
      </span>
      <span className="weapon-kills">
        <strong>{fmt(killer.deaths)}</strong>
        <span className="bar range-bar is-bad">
          <span style={{ width: `${(killer.deaths / top) * 100}%` }} />
        </span>
      </span>
      <span className="killer-col-share">{pct(killer.deathShare)}</span>
      <span className="killer-col-dist">{meters(killer.avgDistance)}</span>
      <span
        className="killer-ranges"
        aria-label={RANGES.map((range) => `${range.label} ${killer.ranges[range.id]}`).join(", ")}
      >
        {total > 0 &&
          RANGES.map((range) => (
            <span
              key={range.id}
              className={`range-${range.id}`}
              style={{ width: `${(killer.ranges[range.id] / total) * 100}%` }}
            />
          ))}
      </span>
    </>
  );

  return (
    <div role="listitem">
      {onSelect ? (
        <button type="button" className={`killer-row${active ? " active" : ""}`} aria-pressed={active} onClick={onSelect}>
          {body}
        </button>
      ) : (
        <div className="killer-row">{body}</div>
      )}
    </div>
  );
}
