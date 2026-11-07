import "../styles/weapons.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { AbilityArt, Art, SpikeGlyph } from "../components/GameArt";
import { Icon } from "../components/Icon";
import { SeasonPicker } from "../components/SeasonPicker";
import type { Account } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, fullDate, pct } from "../lib/format";
import { findAbility, mapArt, useAgentCatalog, weaponArt, type Catalog } from "../lib/gameAssets";
import { lang, t } from "../lib/i18n";
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
const MELEE = "Couteau";
const SPIKE = "Spike";
const FALL = "Chute";
const STACK_LIMIT = 3;
const HISTORY_PAGE = 10;

const meters = (value: number | null) => (value === null ? "-" : `${fmt(value, 1)} m`);
const plural = (count: number, one: string, many: string) => `${fmt(count)} ${(lang() === "en" ? count !== 1 : count > 1) ? many : one}`;

const DETAIL_INLINE_MAX = 860;

function useBelow(limit: number): [(node: HTMLDivElement | null) => (() => void) | undefined, boolean] {
  const [below, setBelow] = useState(false);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return undefined;
      let current = node.getBoundingClientRect().width <= limit;
      setBelow(current);
      const observer = new ResizeObserver(([entry]) => {
        const next = entry.contentRect.width <= limit;
        if (next === current) return;
        current = next;
        flushSync(() => setBelow(next));
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [limit],
  );
  return [ref, below];
}

function displayName(name: string): string {
  if (name === ABILITIES) return t("Capacités", "Abilities");
  if (name === MELEE) return t("Couteau", "Knife");
  if (name === FALL) return t("Chute", "Fall");
  return name;
}

type Armed = { id: string | null; name: string; parts: AbilityPart[] };

type Tracked = { id: string | null; name: string; kills: number; deaths: number; killParts: AbilityPart[]; deathParts: AbilityPart[] };

const partKey = (name: string | null, agentId: string | null) => `${name ?? ""}|${agentId?.toLowerCase() ?? ""}`;

function FallGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={t("Chute", "Fall")} className="fall-glyph">
      <path d="M12 3v13M7 11l5 5 5-5M5 21h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function partLabel(part: AbilityPart, catalog: Catalog | null): string {
  const ability = findAbility(catalog, part.name, part.agentId);
  if (ability) return ability.label;
  if (part.name) return part.name;
  const agent = part.agentId ? catalog?.agents.get(part.agentId) : undefined;
  return agent ? t(`Capacité de ${agent.name}`, `${agent.name} ability`) : t("Capacité inconnue", "Unknown ability");
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
  if (item.name === FALL) {
    return (
      <span className="weapon-thumb" style={{ width, height }}>
        <FallGlyph size={Math.round(height * 0.8)} />
      </span>
    );
  }
  return (
    <span className="weapon-thumb" style={{ width, height }}>
      <Art src={weaponArt(item.id)} width={width} height={height} alt={displayName(item.name)} mono eager={eager} />
    </span>
  );
}

export function Weapons({ account, onOpenRound }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const query = useQuery(season === undefined ? null : queries.weapons(account.puuid, season));
  const data = query.data ?? null;
  const error = query.error;
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [deathsMode, setDeathsMode] = useState(false);
  const [partFilter, setPartFilter] = useState<string | null>(null);
  const [view, setView] = useState<"arsenal" | "killers">("arsenal");
  const [historyOpen, setHistoryOpen] = useState(false);
  const catalog = useAgentCatalog();
  const [wrapRef, narrow] = useBelow(DETAIL_INLINE_MAX);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [historyOpen]);

  const weapon = useMemo(
    () => data?.weapons.find((item) => item.name === selected) ?? data?.weapons[0] ?? null,
    [data, selected],
  );

  const tracked = useMemo<Tracked | null>(() => {
    if (!data) return null;
    const known = (value: string | null | undefined) =>
      value && (data.weapons.some((item) => item.name === value) || data.killers.some((item) => item.name === value)) ? value : null;
    const name = known(target) ?? known(weapon?.name);
    if (name === null) return null;
    const armed = data.weapons.find((item) => item.name === name);
    const killer = data.killers.find((item) => item.name === name);
    if (!armed && !killer) return null;
    return {
      id: armed?.id ?? killer?.id ?? null,
      name,
      kills: armed?.kills ?? 0,
      deaths: killer?.deaths ?? armed?.deaths ?? 0,
      killParts: armed?.parts ?? [],
      deathParts: killer?.parts ?? [],
    };
  }, [data, target, weapon]);

  function track(name: string, deaths: boolean, part: string | null = null, open = false) {
    if (data?.weapons.some((item) => item.name === name)) setSelected(name);
    setTarget(name);
    setDeathsMode(deaths);
    setPartFilter(part);
    if (open) setHistoryOpen(true);
  }

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

  if (historyOpen && data && tracked && season !== undefined) {
    return (
      <div className="content">
        <header className="page-head">
          <div className="page-head-title" style={{ alignItems: "center" }}>
            <button type="button" className="back-btn" onClick={() => setHistoryOpen(false)}>
              <Icon name="arrowRight" size={16} strokeWidth={2} className="flip" />
              {t("Armes", "Weapons")}
            </button>
            <span className="faint">{season ? seasonLabel(season) : t("Toutes les saisons", "All seasons")}</span>
          </div>
        </header>
        <WeaponHistory
          key={`${season ?? "all"}-${tracked.name}`}
          puuid={account.puuid}
          season={season}
          tracked={tracked}
          catalog={catalog}
          deaths={deathsMode}
          onDeaths={(value) => {
            setDeathsMode(value);
            setPartFilter(null);
          }}
          filter={partFilter}
          onFilter={setPartFilter}
          onOpenRound={onOpenRound}
        />
      </div>
    );
  }

  return (
    <div className="content weapons-page">
      <header className="page-head">
        <h1 className="title">{t("Armes", "Weapons")}</h1>
        <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />
      </header>

      {error && !data && <p className="form-error">{error}</p>}

      {!data ? (
        !error && <div className="empty">{t("Chargement de tes armes...", "Loading your weapons...")}</div>
      ) : empty ? (
        <div className="empty">
          {data.matches === 0
            ? t("Aucun match compétitif synchronisé sur cette période.", "No competitive matches synced for this period.")
            : t("Aucun kill enregistré sur cette période.", "No kills recorded in this period.")}
        </div>
      ) : (
        <>
          <section className="weapons-summary">
            {favorite && (
              <button
                type="button"
                className="weapons-favorite"
                onClick={() => {
                  setView("arsenal");
                  track(favorite.name, false);
                }}
              >
                <span className="weapons-favorite-art">
                  <Art src={weaponArt(favorite.id)} width={360} height={112} alt={favorite.name} mono eager />
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <span className="label">{t("Arme principale", "Main weapon")}</span>
                  <strong className="weapons-favorite-name">{favorite.name}</strong>
                  <span className="faint">
                    {plural(favorite.kills, "kill", "kills")}, {t(`${pct(favorite.killShare)} de tes kills`, `${pct(favorite.killShare)} of your kills`)}
                  </span>
                </span>
              </button>
            )}
            <div className="stack weapons-totals" style={{ gap: 14 }}>
              <div className="stack" style={{ gap: 4 }}>
                <span className="big-number">{fmt(data.kills)}</span>
                <span className="muted">
                  {t(`kills sur ${plural(data.matches, "match", "matchs")}`, `kills over ${plural(data.matches, "match", "matches")}`)}
                </span>
              </div>
              <div className="weapons-facts">
                <div className="stack" style={{ gap: 2 }}>
                  <span className="label">{t("Distance moyenne", "Avg distance")}</span>
                  <span className="weapons-fact">{meters(overall)}</span>
                  <span className="faint weapons-fact-sub">{t("entre toi et ta cible", "between you and your target")}</span>
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <span className="label">{t("Morts subies", "Deaths")}</span>
                  <span className="weapons-fact">{fmt(data.deaths)}</span>
                  <span className="faint weapons-fact-sub">{t("par un adversaire", "to an enemy")}</span>
                </div>
              </div>
            </div>
            <BodySplit report={data} />
          </section>

          <div className="section-head" style={{ alignItems: "center" }}>
            <div className="segmented" role="tablist" aria-label={t("Tes kills ou tes morts", "Your kills or your deaths")}>
              <button
                type="button"
                role="tab"
                aria-selected={view === "arsenal"}
                className={view === "arsenal" ? "active" : undefined}
                onClick={() => setView("arsenal")}
              >
                {t("Ton arsenal", "Your arsenal")} <span className="chip-count">{fmt(data.weapons.length)}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "killers"}
                className={view === "killers" ? "active" : undefined}
                onClick={() => setView("killers")}
              >
                {t("Ce qui te tue", "What kills you")} <span className="chip-count">{fmt(data.killers.length)}</span>
              </button>
            </div>
            {view === "killers" && killers.length > 0 && <RangeLegend />}
          </div>

          {view === "arsenal" &&
            (data.weapons.length === 0 ? (
              <div className="empty">{t("Aucun kill enregistré sur cette période.", "No kills recorded in this period.")}</div>
            ) : (
              <div className="weapons-wrap" ref={wrapRef}>
                <div className="weapons-layout">
                  <div className="stack" style={{ gap: 10, minWidth: 0 }}>
                    <div className="weapons-table weapons-pane" role="list">
                      <div className="weapon-row head" aria-hidden="true">
                        <span>{t("Arme", "Weapon")}</span>
                        <span>Kills</span>
                        <span className="weapon-col-share">{t("Part", "Share")}</span>
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
                              onClick={() => track(item.name, false)}
                            >
                              <span className="weapon-ident">
                                <WeaponThumb item={item} catalog={catalog} width={84} height={28} />
                                <span className="weapon-name">
                                  <strong>{displayName(item.name)}</strong>
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
                            {active && narrow && (
                              <div className="weapon-inline">
                                <WeaponDetail
                                  weapon={item}
                                  catalog={catalog}
                                  onPick={(part) => track(ABILITIES, false, part, true)}
                                  onHistory={() => track(item.name, false, null, true)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <span className="faint weapons-note">
                      {t(
                        "HS estimé à partir des tirs touchés pendant les rounds où l'arme était ton arme principale. K/round : kills par round où tu la portais.",
                        "HS estimated from shots hit in rounds where this was your main weapon. K/round: kills per round you held it.",
                      )}
                    </span>
                  </div>
                  {weapon && !narrow && (
                    <aside className="weapons-side weapons-pane panel" aria-label={t(`Détail ${displayName(weapon.name)}`, `${displayName(weapon.name)} details`)}>
                      <WeaponDetail
                        weapon={weapon}
                        catalog={catalog}
                        onPick={(part) => track(ABILITIES, false, part, true)}
                        onHistory={() => track(weapon.name, false, null, true)}
                      />
                    </aside>
                  )}
                </div>
              </div>
            ))}

          {view === "killers" &&
            (killers.length === 0 ? (
              <div className="empty">{t("Aucune mort subie sur cette période.", "No deaths in this period.")}</div>
            ) : (
              <div className="killers-layout">
                <div className="stack" style={{ gap: 10, minWidth: 0 }}>
                  <div className="killers-table" role="list">
                    {killers.map((item) => (
                      <KillerRow
                        key={item.name}
                        killer={item}
                        catalog={catalog}
                        top={topDeaths}
                        onSelect={() => track(item.name, true, null, true)}
                      />
                    ))}
                  </div>
                  {data.killers.length > KILLER_LIMIT && (
                    <span className="faint weapons-note">
                      {t(
                        `${plural(data.killers.length - KILLER_LIMIT, "autre arme", "autres armes")} représentent ${pct(data.killers.slice(KILLER_LIMIT).reduce((sum, item) => sum + item.deathShare, 0))} de tes morts.`,
                        `${plural(data.killers.length - KILLER_LIMIT, "other weapon", "other weapons")} account for ${pct(data.killers.slice(KILLER_LIMIT).reduce((sum, item) => sum + item.deathShare, 0))} of your deaths.`,
                      )}
                    </span>
                  )}
                </div>
                {abilityKillers.length > 0 && (
                  <aside className="stack weapons-pane" style={{ gap: 10 }}>
                    <h3 className="weapon-detail-sub">{t("Capacités qui t'ont tué", "Abilities that killed you")}</h3>
                    <PartList parts={abilityKillers} catalog={catalog} unit="mort" onPick={(part) => track(ABILITIES, true, part, true)} />
                  </aside>
                )}
              </div>
            ))}
        </>
      )}
    </div>
  );
}

const MIRROR = "matrix(-1 0 0 1 120 0)";
const BODY_HEAD = "M60 6C67.6 6 73 12.6 73 21.4C73 31 67.4 38 60 38S47 31 47 21.4C47 12.6 52.4 6 60 6Z";
const BODY_TORSO =
  "M55 41C55 43.5 54.5 45.2 53 46.5C48.5 49.5 42 50.5 36 52C30 54 27 58 27 64C27 69 30 72 33 74C34.5 86 37.5 99 41.5 110C42.5 116 41.5 124 40.5 130C40 133 40.5 135.5 41 137H79C79.5 135.5 80 133 79.5 130C78.5 124 77.5 116 78.5 110C82.5 99 85.5 86 87 74C90 72 93 69 93 64C93 58 90 54 84 52C78 50.5 71.5 49.5 67 46.5C65.5 45.2 65 43.5 65 41Z";
const BODY_ARM = "M23 70C20 84 18 100 17 114C16 124 15 132 15.5 140C15.8 145 21.5 145.5 22 141C23 132 25 123 27 114C29 104 30 92 30 80C30 75 27 70 23 70Z";
const BODY_LEG =
  "M41 141H58.5C58.6 154 57.8 168 56.8 184C56.3 194 55.8 201 55.9 207C56.2 216 56.4 224 55.6 231C55.2 235.5 52 237 49 236.5C46.6 236 45.6 234.2 45.7 231C45.9 226 44.2 220 43.2 213C42.2 206 42.6 198 41.6 190C40.2 176 39 158 41 141Z";
const BODY_LABEL_X = 142;

function BodySplit({ report }: { report: WeaponReport }) {
  const total = report.headshots + report.bodyshots + report.legshots;
  const zones = [
    { id: "head", label: t("Tête", "Head"), value: report.hsPct, count: report.headshots, y: 22, from: 77, paths: [{ d: BODY_HEAD }] },
    {
      id: "body",
      label: t("Corps", "Body"),
      value: report.bodyPct,
      count: report.bodyshots,
      y: 100,
      from: 106,
      paths: [{ d: BODY_TORSO }, { d: BODY_ARM }, { d: BODY_ARM, mirror: true }],
    },
    {
      id: "legs",
      label: t("Jambes", "Legs"),
      value: report.legPct,
      count: report.legshots,
      y: 186,
      from: 84,
      paths: [{ d: BODY_LEG }, { d: BODY_LEG, mirror: true }],
    },
  ];
  const top = Math.max(1, ...zones.map((zone) => zone.value));
  const tone = (value: number) =>
    total > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(22 + (value / top) * 78)}%, var(--field))` : "var(--field)";
  const shots = (count: number) => t(plural(count, "tir", "tirs"), plural(count, "hit", "hits"));
  const summary = zones.map((zone) => `${zone.label} ${total > 0 ? pct(zone.value) : "-"}`).join(", ");

  return (
    <div className="body-split">
      <svg className="body-figure" width="292" height="240" viewBox="0 0 292 240" role="img" aria-label={t(`Répartition des tirs touchés : ${summary}`, `Hit shots breakdown: ${summary}`)}>
        {zones.map((zone) => (
          <g key={zone.id} className="body-zone" style={{ fill: tone(zone.value) }}>
            <title>{`${zone.label}, ${total > 0 ? pct(zone.value) : "-"}, ${shots(zone.count)}`}</title>
            {zone.paths.map((path, index) => (
              <path key={index} d={path.d} transform={"mirror" in path && path.mirror ? MIRROR : undefined} />
            ))}
          </g>
        ))}
        {zones.map((zone) => (
          <g key={`${zone.id}-label`} aria-hidden="true">
            <line className="body-leader" x1={zone.from} y1={zone.y} x2={BODY_LABEL_X - 10} y2={zone.y} />
            <circle className="body-anchor" cx={zone.from} cy={zone.y} r={2.5} />
            <text className="body-value" x={BODY_LABEL_X} y={zone.y + 10}>
              {total > 0 ? pct(zone.value) : "-"}
            </text>
            <text className="body-label" x={BODY_LABEL_X} y={zone.y + 33}>
              {`${zone.label}, ${shots(zone.count)}`}
            </text>
          </g>
        ))}
      </svg>
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

function PartList({
  parts,
  catalog,
  unit,
  onPick,
}: {
  parts: AbilityPart[];
  catalog: Catalog | null;
  unit: "kill" | "mort";
  onPick?: (key: string) => void;
}) {
  return (
    <ul className="weapon-parts">
      {parts.map((part) => {
        const agent = agentName(part, catalog);
        const label = partLabel(part, catalog);
        const body = (
          <>
            <span className="weapon-part-icon">
              <PartIcon part={part} catalog={catalog} size={28} />
            </span>
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <strong className="ellipsis">{label}</strong>
              {agent && <span className="faint ellipsis weapon-part-agent-name">{agent}</span>}
            </span>
            <span className="weapon-part-count">
              {fmt(part.count)}
              <small>
                {" "}
                {unit === "kill"
                  ? t(part.count > 1 ? "kills" : "kill", part.count === 1 ? "kill" : "kills")
                  : t(part.count > 1 ? "morts" : "mort", part.count === 1 ? "death" : "deaths")}
              </small>
            </span>
          </>
        );
        return (
          <li key={`${part.name}-${part.agentId}`}>
            {onPick ? (
              <button
                type="button"
                className="weapon-part is-link"
                onClick={() => onPick(partKey(part.name, part.agentId))}
                aria-label={t(`Voir l'historique : ${label}`, `Show history: ${label}`)}
              >
                {body}
              </button>
            ) : (
              <div className="weapon-part">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WeaponDetail({
  weapon,
  catalog,
  onPick,
  onHistory,
}: {
  weapon: WeaponLine;
  catalog: Catalog | null;
  onPick?: (key: string) => void;
  onHistory?: () => void;
}) {
  const measured = rangeTotal(weapon.killRanges);
  const figures = [
    { label: "Kills", value: fmt(weapon.kills) },
    { label: t("Rounds portée", "Rounds held"), value: fmt(weapon.roundsHeld) },
    { label: "K/round", value: weapon.killsPerRoundHeld === null ? "-" : fmt(weapon.killsPerRoundHeld, 2) },
    { label: t("HS estimé", "Est. HS"), value: weapon.hsPct === null ? "-" : pct(weapon.hsPct, 0) },
  ];
  const ability = weapon.name === ABILITIES;

  return (
    <div className="weapon-detail">
      <div className="weapon-detail-head">
        <span className="weapon-detail-art">
          {ability ? (
            <WeaponThumb item={weapon} catalog={catalog} width={150} height={40} />
          ) : (
            <WeaponThumb item={weapon} catalog={catalog} width={180} height={58} eager />
          )}
        </span>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="eyebrow">{weaponCategory(weapon.name)}</span>
          <h3 className="weapon-detail-title">{displayName(weapon.name)}</h3>
        </div>
      </div>

      {onHistory && (
        <button type="button" className="btn btn-secondary weapon-history-open" onClick={onHistory}>
          {t("Voir l'historique des kills et des morts", "See kill and death history")}
          <Icon name="arrowRight" size={16} strokeWidth={2} />
        </button>
      )}

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
          <span className="weapon-detail-sub">{t("Tes kills par capacité", "Your kills by ability")}</span>
          <PartList parts={weapon.parts} catalog={catalog} unit="kill" onPick={onPick} />
        </div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        <div className="row between wrap" style={{ alignItems: "baseline" }}>
          <span className="weapon-detail-sub">{t("Distance de tes kills", "Your kill distance")}</span>
          <span className="faint" style={{ fontSize: 13 }}>
            {t(`moyenne ${meters(weapon.avgKillDistance)}`, `avg ${meters(weapon.avgKillDistance)}`)}
          </span>
        </div>
        {measured > 0 ? (
          <RangeBars ranges={weapon.killRanges} tone="good" />
        ) : (
          <span className="faint">{t("Aucune position enregistrée pour ces kills.", "No positions recorded for these kills.")}</span>
        )}
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <div className="row between wrap" style={{ alignItems: "baseline" }}>
          <span className="weapon-detail-sub">{t("Face à cette arme", "Against this weapon")}</span>
          <span className="faint" style={{ fontSize: 13 }}>
            {t(plural(weapon.deaths, "mort", "morts"), plural(weapon.deaths, "death", "deaths"))}
            {weapon.avgDeathDistance !== null && t(`, moyenne ${meters(weapon.avgDeathDistance)}`, `, avg ${meters(weapon.avgDeathDistance)}`)}
          </span>
        </div>
        {rangeTotal(weapon.deathRanges) > 0 ? (
          <RangeBars ranges={weapon.deathRanges} tone="bad" />
        ) : (
          <span className="faint">{t("Aucune mort subie avec cette arme.", "No deaths to this weapon.")}</span>
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
  onSelect,
}: {
  killer: KillerLine;
  catalog: Catalog | null;
  top: number;
  onSelect?: () => void;
}) {
  const total = rangeTotal(killer.ranges);
  const body = (
    <>
      <span className="weapon-ident">
        <WeaponThumb item={killer} catalog={catalog} width={84} height={28} />
        <span className="weapon-name">
          <strong>{displayName(killer.name)}</strong>
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
        <button type="button" className="killer-row" onClick={onSelect}>
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

function entryPart(entry: WeaponDuel, deaths: boolean): AbilityPart {
  return { name: entry.ability, agentId: deaths ? entry.opponentAgentId : entry.agentId, count: 0 };
}

function WeaponHistory({
  puuid,
  season,
  tracked,
  catalog,
  deaths,
  onDeaths,
  filter,
  onFilter,
  onOpenRound,
}: {
  puuid: string;
  season: string | null;
  tracked: Tracked;
  catalog: Catalog | null;
  deaths: boolean;
  onDeaths: (deaths: boolean) => void;
  filter: string | null;
  onFilter: (filter: string | null) => void;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
}) {
  const [shown, setShown] = useState(HISTORY_PAGE);
  const query = useQuery(queries.weaponHistory(puuid, season, tracked.name, deaths));
  const list = query.pending ? null : (query.data ?? []);
  const total = deaths ? tracked.deaths : tracked.kills;
  const ability = tracked.name === ABILITIES;
  const parts = ability ? (deaths ? tracked.deathParts : tracked.killParts) : [];
  const active = filter !== null && parts.some((part) => partKey(part.name, part.agentId) === filter) ? filter : null;
  const visible = useMemo(() => {
    if (!list || active === null) return list;
    return list.filter((entry) => {
      const part = entryPart(entry, deaths);
      return partKey(part.name, part.agentId) === active;
    });
  }, [list, active, deaths]);
  const name = displayName(tracked.name);

  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ alignItems: "center", gap: 12 }}>
        <h2 className="section-title">{t(`Historique : ${name}`, `History: ${name}`)}</h2>
        <div className="segmented" role="tablist" aria-label={t("Kills ou morts", "Kills or deaths")}>
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
              {value ? t(`Tes morts ${fmt(tracked.deaths)}`, `Your deaths ${fmt(tracked.deaths)}`) : t(`Tes kills ${fmt(tracked.kills)}`, `Your kills ${fmt(tracked.kills)}`)}
            </button>
          ))}
        </div>
      </div>
      {parts.length > 1 && (
        <div className="chips" role="group" aria-label={t("Filtrer par capacité", "Filter by ability")}>
          <button type="button" className={`chip${active === null ? " active" : ""}`} aria-pressed={active === null} onClick={() => onFilter(null)}>
            {t("Toutes", "All")} <span className="chip-count">{fmt(total)}</span>
          </button>
          {parts.map((part) => {
            const key = partKey(part.name, part.agentId);
            return (
              <button
                key={key}
                type="button"
                className={`chip history-chip${active === key ? " active" : ""}`}
                aria-pressed={active === key}
                onClick={() => {
                  onFilter(active === key ? null : key);
                  setShown(HISTORY_PAGE);
                }}
              >
                <PartIcon part={part} catalog={catalog} size={18} />
                {partLabel(part, catalog)} <span className="chip-count">{fmt(part.count)}</span>
              </button>
            );
          })}
        </div>
      )}
      {total === 0 ? (
        <span className="faint">
          {deaths ? t("Aucune mort subie avec cette arme.", "No deaths to this weapon.") : t("Aucun kill avec cette arme.", "No kills with this weapon.")}
        </span>
      ) : query.error && list === null ? (
        <span className="form-error">{query.error}</span>
      ) : visible === null ? (
        <span className="faint">{t("Recherche dans tes matchs...", "Searching your matches...")}</span>
      ) : visible.length === 0 ? (
        <span className="faint">{t("Aucun round retrouvé dans tes matchs.", "No round found in your matches.")}</span>
      ) : (
        <>
          <ul className="weapon-history" aria-label={deaths ? t("Tes morts face à cette arme", "Your deaths to this weapon") : t("Tes kills avec cette arme", "Your kills with this weapon")}>
            {visible.slice(0, shown).map((entry) => (
              <HistoryRow
                key={`${entry.matchId}-${entry.roundIndex}-${entry.timeMs}`}
                entry={entry}
                deaths={deaths}
                part={ability ? entryPart(entry, deaths) : null}
                catalog={catalog}
                onOpenRound={onOpenRound}
              />
            ))}
          </ul>
          {visible.length > shown && (
            <button type="button" className="btn btn-secondary" style={{ alignSelf: "center" }} onClick={() => setShown(shown + HISTORY_PAGE * 2)}>
              {t("Afficher plus", "Show more")}
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
  part,
  catalog,
  onOpenRound,
}: {
  entry: WeaponDuel;
  deaths: boolean;
  part: AbilityPart | null;
  catalog: Catalog | null;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
}) {
  const round = entry.roundIndex + 1;
  const map = entry.mapName ?? t("Map inconnue", "Unknown map");
  const means = part ? partLabel(part, catalog) : null;
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
            {deaths ? t("Tué par ", "Killed by ") : ""}
            {entry.opponent}
          </strong>
          <span className="faint ellipsis" style={{ fontSize: 12 }}>
            {t(`${map}, round ${round} à ${clock(entry.timeMs)}, ${fullDate(entry.startedAt)}`, `${map}, round ${round} at ${clock(entry.timeMs)}, ${fullDate(entry.startedAt)}`)}
          </span>
        </span>
      </span>
      {part && means && (
        <span className="weapon-history-means" title={means}>
          <span className="weapon-part-icon">
            <PartIcon part={part} catalog={catalog} size={22} />
          </span>
          <span className="ellipsis">{means}</span>
        </span>
      )}
      <span className="weapon-history-dist">{meters(entry.distance)}</span>
      {entry.roundWon !== null && (
        <span className={`weapon-history-result ${entry.roundWon ? "is-win" : "is-loss"}`}>
          {entry.roundWon ? t("Round gagné", "Round won") : t("Round perdu", "Round lost")}
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
          aria-label={t(`Ouvrir le round ${round} sur ${map}`, `Open round ${round} on ${map}`)}
        >
          {body}
        </button>
      ) : (
        <div className="weapon-history-row">{body}</div>
      )}
    </li>
  );
}

