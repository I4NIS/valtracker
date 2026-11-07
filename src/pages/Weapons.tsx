import "../styles/weapons.css";
import { useMemo, useState } from "react";
import { AbilityArt, Art, SpikeGlyph } from "../components/GameArt";
import { SeasonPicker } from "../components/SeasonPicker";
import type { Account } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, fullDate, pct } from "../lib/format";
import { findAbility, mapArt, useAgentCatalog, weaponArt, type Catalog } from "../lib/gameAssets";
import { useQuery } from "../lib/query";
import { defaultSeason, queries } from "../lib/queries";
import {
  RANGES,
  rangeTotal,
  weaponCategory,
  type AbilityPart,
  type KillerLine,
  type RangeSplit,
  type WeaponDuel,
  type WeaponLine,
  type WeaponReport,
} from "../lib/weapons";

type Props = {
  account: Account;
  refreshKey: number;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
};

const KILLER_LIMIT = 8;
const ABILITIES = "Capacités";
const SPIKE = "Spike";
const STACK_LIMIT = 3;
const HISTORY_PAGE = 10;

const meters = (value: number | null) => (value === null ? "-" : `${fmt(value, 1)} m`);
const plural = (count: number, one: string, many: string) => `${fmt(count)} ${count > 1 ? many : one}`;

type Armed = { id: string | null; name: string; parts: AbilityPart[] };

function partLabel(part: AbilityPart, catalog: Catalog | null): string {
  const ability = findAbility(catalog, part.name, part.agentId);
  if (ability) return ability.label;
  if (part.name) return part.name;
  const agent = part.agentId ? catalog?.agents.get(part.agentId) : undefined;
  return agent ? `Capacité de ${agent.name}` : "Capacité inconnue";
}

function agentName(part: AbilityPart, catalog: Catalog | null): string | null {
  return part.agentId ? (catalog?.agents.get(part.agentId)?.name ?? null) : null;
}

function PartIcon({ part, catalog, size }: { part: AbilityPart; catalog: Catalog | null; size: number }) {
  const ability = findAbility(catalog, part.name, part.agentId);
  if (ability?.icon) return <AbilityArt ability={ability} size={size} />;
  return <Art src={agentIcon(part.agentId)} width={size} height={size} alt="" className="weapon-part-agent" />;
}

function WeaponThumb({ item, catalog, width, height, eager }: { item: Armed; catalog: Catalog | null; width: number; height: number; eager?: boolean }) {
  if (item.name === ABILITIES) {
    const parts = item.parts.slice(0, STACK_LIMIT);
    const size = Math.round(height * 0.86);
    return (
      <span className="weapon-thumb weapon-thumb-stack" style={{ width, height }} aria-hidden="true">
        {parts.map((part) => (
          <PartIcon key={`${part.name}-${part.agentId}`} part={part} catalog={catalog} size={size} />
        ))}
      </span>
    );
  }
  if (item.name === SPIKE) {
    return (
      <span className="weapon-thumb" style={{ width, height }}>
        <SpikeGlyph size={Math.round(height * 0.8)} />
      </span>
    );
  }
  return (
    <span className="weapon-thumb" style={{ width, height }}>
      <Art src={weaponArt(item.id)} width={width} height={height} alt={item.name} mono eager={eager} />
    </span>
  );
}

export function Weapons({ account, onOpenRound }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const query = useQuery(season === undefined ? null : queries.weapons(account.puuid, season));
  const data = query.data ?? null;
  const error = query.error;
  const [selected, setSelected] = useState<string | null>(null);
  const [deathsMode, setDeathsMode] = useState(false);
  const catalog = useAgentCatalog();

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
  const abilityKillers = data?.killers.find((item) => item.name === ABILITIES)?.parts ?? [];
  const empty = data !== null && data.kills === 0 && data.weapons.length === 0 && data.killers.length === 0;

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{season ? seasonLabel(season) : "Toutes les saisons"}</span>
        <h1 className="title">Armes</h1>
      </div>

      <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />

      {error && !data && <p className="form-error">{error}</p>}

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
            {favorite && (
              <button type="button" className="weapons-favorite" onClick={() => setSelected(favorite.name)}>
                <span className="label">Arme principale</span>
                <span className="weapons-favorite-art">
                  <Art src={weaponArt(favorite.id)} width={360} height={112} alt={favorite.name} mono eager />
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <strong className="weapons-favorite-name">{favorite.name}</strong>
                  <span className="faint">
                    {plural(favorite.kills, "kill", "kills")}, {pct(favorite.killShare)} de tes kills
                  </span>
                </span>
              </button>
            )}
            <div className="stack weapons-totals" style={{ gap: 18 }}>
              <div className="stack" style={{ gap: 8 }}>
                <span className="big-number">{fmt(data.kills)}</span>
                <span className="muted">kills sur {plural(data.matches, "match", "matchs")}</span>
              </div>
              <div className="weapons-facts">
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
                            onClick={() => {
                              setSelected(item.name);
                              setDeathsMode(false);
                            }}
                          >
                            <span className="weapon-ident">
                              <WeaponThumb item={item} catalog={catalog} width={84} height={28} />
                              <span className="weapon-name">
                                <strong>{item.name}</strong>
                                <span className="faint">{weaponCategory(item.name)}</span>
                              </span>
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
                              <WeaponDetail weapon={item} catalog={catalog} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {weapon && (
                    <aside className="weapons-side panel" aria-label={`Détail ${weapon.name}`}>
                      <WeaponDetail weapon={weapon} catalog={catalog} />
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

          {weapon && season !== undefined && (
            <WeaponHistory
              key={`${season ?? "all"}-${weapon.name}`}
              puuid={account.puuid}
              season={season}
              weapon={weapon}
              deaths={deathsMode}
              onDeaths={setDeathsMode}
              onOpenRound={onOpenRound}
            />
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
                    catalog={catalog}
                    top={topDeaths}
                    active={weapon?.name === item.name}
                    onSelect={
                      data.weapons.some((entry) => entry.name === item.name)
                        ? () => {
                            setSelected(item.name);
                            setDeathsMode(true);
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
              {data.killers.length > KILLER_LIMIT && (
                <span className="faint weapons-note">
                  {plural(data.killers.length - KILLER_LIMIT, "autre arme", "autres armes")} représentent{" "}
                  {pct(data.killers.slice(KILLER_LIMIT).reduce((sum, item) => sum + item.deathShare, 0))} de tes morts.
                </span>
              )}
              {abilityKillers.length > 0 && (
                <div className="stack" style={{ gap: 10 }}>
                  <h3 className="weapon-detail-sub">Capacités qui t'ont tué</h3>
                  <PartList parts={abilityKillers} catalog={catalog} unit="mort" />
                </div>
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

function PartList({ parts, catalog, unit }: { parts: AbilityPart[]; catalog: Catalog | null; unit: "kill" | "mort" }) {
  return (
    <ul className="weapon-parts">
      {parts.map((part) => {
        const agent = agentName(part, catalog);
        return (
          <li key={`${part.name}-${part.agentId}`} className="weapon-part">
            <span className="weapon-part-icon">
              <PartIcon part={part} catalog={catalog} size={28} />
            </span>
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <strong className="ellipsis">{partLabel(part, catalog)}</strong>
              {agent && <span className="faint ellipsis weapon-part-agent-name">{agent}</span>}
            </span>
            <span className="weapon-part-count">
              {fmt(part.count)}
              <small> {part.count > 1 ? `${unit}s` : unit}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function WeaponDetail({ weapon, catalog }: { weapon: WeaponLine; catalog: Catalog | null }) {
  const measured = rangeTotal(weapon.killRanges);
  const figures = [
    { label: "Kills", value: fmt(weapon.kills) },
    { label: "Rounds portée", value: fmt(weapon.roundsHeld) },
    { label: "K/round", value: weapon.killsPerRoundHeld === null ? "-" : fmt(weapon.killsPerRoundHeld, 2) },
    { label: "HS estimé", value: weapon.hsPct === null ? "-" : pct(weapon.hsPct, 0) },
  ];
  const ability = weapon.name === ABILITIES;

  return (
    <div className="weapon-detail">
      <div className="weapon-detail-head">
        <span className="weapon-detail-art">
          {ability ? (
            <WeaponThumb item={weapon} catalog={catalog} width={240} height={64} />
          ) : (
            <WeaponThumb item={weapon} catalog={catalog} width={320} height={104} eager />
          )}
        </span>
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{weaponCategory(weapon.name)}</span>
          <h3 className="weapon-detail-title">{weapon.name}</h3>
        </div>
      </div>

      <div className="weapon-figures">
        {figures.map((figure) => (
          <div className="stack" style={{ gap: 2 }} key={figure.label}>
            <span className="label">{figure.label}</span>
            <span className="weapon-figure">{figure.value}</span>
          </div>
        ))}
      </div>

      {ability && weapon.parts.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          <span className="weapon-detail-sub">Tes kills par capacité</span>
          <PartList parts={weapon.parts} catalog={catalog} unit="kill" />
        </div>
      )}

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
  catalog,
  top,
  active,
  onSelect,
}: {
  killer: KillerLine;
  catalog: Catalog | null;
  top: number;
  active: boolean;
  onSelect?: () => void;
}) {
  const total = rangeTotal(killer.ranges);
  const body = (
    <>
      <span className="weapon-ident">
        <WeaponThumb item={killer} catalog={catalog} width={84} height={28} />
        <span className="weapon-name">
          <strong>{killer.name}</strong>
          <span className="faint">{weaponCategory(killer.name)}</span>
        </span>
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

function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function WeaponHistory({
  puuid,
  season,
  weapon,
  deaths,
  onDeaths,
  onOpenRound,
}: {
  puuid: string;
  season: string | null;
  weapon: WeaponLine;
  deaths: boolean;
  onDeaths: (deaths: boolean) => void;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
}) {
  const [shown, setShown] = useState(HISTORY_PAGE);
  const query = useQuery(queries.weaponHistory(puuid, season, weapon.name, deaths));
  const list = query.pending ? null : (query.data ?? []);
  const total = deaths ? weapon.deaths : weapon.kills;

  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ alignItems: "center", gap: 12 }}>
        <h2 className="section-title">Historique : {weapon.name}</h2>
        <div className="segmented" role="tablist" aria-label="Kills ou morts">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              role="tab"
              aria-selected={deaths === value}
              className={deaths === value ? "active" : undefined}
              onClick={() => {
                onDeaths(value);
                setShown(HISTORY_PAGE);
              }}
            >
              {value ? `Tes morts ${fmt(weapon.deaths)}` : `Tes kills ${fmt(weapon.kills)}`}
            </button>
          ))}
        </div>
      </div>
      {total === 0 ? (
        <span className="faint">{deaths ? "Aucune mort subie avec cette arme." : "Aucun kill avec cette arme."}</span>
      ) : list === null ? (
        <span className="faint">Recherche dans tes matchs...</span>
      ) : (
        <>
          <ul className="weapon-history" aria-label={deaths ? "Tes morts face à cette arme" : "Tes kills avec cette arme"}>
            {list.slice(0, shown).map((entry) => (
              <HistoryRow key={`${entry.matchId}-${entry.roundIndex}-${entry.timeMs}`} entry={entry} deaths={deaths} onOpenRound={onOpenRound} />
            ))}
          </ul>
          {list.length > shown && (
            <button type="button" className="btn btn-secondary" style={{ alignSelf: "center" }} onClick={() => setShown(shown + HISTORY_PAGE * 2)}>
              Afficher plus
            </button>
          )}
        </>
      )}
    </section>
  );
}

function HistoryRow({
  entry,
  deaths,
  onOpenRound,
}: {
  entry: WeaponDuel;
  deaths: boolean;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
}) {
  const round = entry.roundIndex + 1;
  const map = entry.mapName ?? "Map inconnue";
  const body = (
    <>
      <span className="weapon-history-map">
        <Art src={mapArt(entry.mapId, "listviewicon")} width={112} height={44} alt="" className="weapon-history-map-art" />
        <Art src={agentIcon(entry.agentId)} width={30} height={30} alt="" className="weapon-history-agent" />
      </span>
      <span className="weapon-history-who">
        <Art src={agentIcon(entry.opponentAgentId)} width={28} height={28} alt="" className="weapon-history-face" />
        <span className="stack" style={{ gap: 2, minWidth: 0 }}>
          <strong className="ellipsis">
            {deaths ? "Tué par " : ""}
            {entry.opponent}
          </strong>
          <span className="faint ellipsis" style={{ fontSize: 12 }}>
            {map}, round {round} à {clock(entry.timeMs)}, {fullDate(entry.startedAt)}
          </span>
        </span>
      </span>
      <span className="weapon-history-dist">{meters(entry.distance)}</span>
      {entry.roundWon !== null && (
        <span className={`weapon-history-result ${entry.roundWon ? "is-win" : "is-loss"}`}>
          {entry.roundWon ? "Round gagné" : "Round perdu"}
        </span>
      )}
    </>
  );
  return (
    <li>
      {onOpenRound ? (
        <button
          type="button"
          className="weapon-history-row"
          onClick={() => onOpenRound(entry.matchId, entry.roundIndex)}
          aria-label={`Ouvrir le round ${round} sur ${map}`}
        >
          {body}
        </button>
      ) : (
        <div className="weapon-history-row">{body}</div>
      )}
    </li>
  );
}
