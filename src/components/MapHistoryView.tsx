import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { agentIcon, seasonLabel } from "../lib/assets";
import { clock, fmt, fullDate, shortDate } from "../lib/format";
import { findAbility, useAgentCatalog, type Catalog } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { usePageVisible } from "../lib/navigation";
import type { MapAction, MapGame, MapHistory } from "../lib/mapStats";
import { rotatePoint, rotationStyle, type Point } from "../lib/minimap";
import { FilterPill, type PillOption } from "./FilterPill";
import { Art, fadeIn, KillMeans, meansLabel } from "./GameArt";
import { Icon } from "./Icon";
import { PointCanvas } from "./PointCanvas";
import { SortHeader } from "./SortHeader";
import { useSort } from "../lib/sort";

type Kind = MapAction["kind"];
type Side = "attack" | "defense";
type Phase = MapAction["phase"];
type Result = "won" | "lost";

type Filters = {
  side: Side | null;
  phase: Phase | null;
  result: Result | null;
  agent: string | null;
  zone: string | null;
  act: string | null;
};

type Props = {
  history: MapHistory;
  mapName: string;
  season: string | null;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
};

const PAGE = 80;
const TOP_ZONES = 5;
const NO_FILTERS: Filters = { side: null, phase: null, result: null, agent: null, zone: null, act: null };

const sideLabel = (attack: boolean) => (attack ? t("Attaque", "Attack") : t("Défense", "Defense"));
const shortSide = (attack: boolean) => (attack ? t("ATT", "ATK") : "DEF");
const pctOf = (value: number) => `${value * 100}%`;
const deathCount = (count: number) => t(`${count} ${count > 1 ? "morts" : "mort"}`, `${count} ${count === 1 ? "death" : "deaths"}`);
const killCount = (count: number) => t(`${count} ${count > 1 ? "kills" : "kill"}`, `${count} ${count === 1 ? "kill" : "kills"}`);

const PHASES = (): PillOption<Phase>[] => [
  { value: "early", label: t("Début de round", "Early round") },
  { value: "mid", label: t("Milieu de round", "Mid round") },
  { value: "post", label: t("Après le plant", "Post-plant") },
];

const SIDES = (): PillOption<Side>[] => [
  { value: "attack", label: t("Attaque", "Attack") },
  { value: "defense", label: t("Défense", "Defense") },
];

const RESULTS = (): PillOption<Result>[] => [
  { value: "won", label: t("Rounds gagnés", "Rounds won") },
  { value: "lost", label: t("Rounds perdus", "Rounds lost") },
];

function spot(action: MapAction) {
  return action.kind === "death" ? action.mePosition : action.opponentPosition;
}

function matchResult(game: MapGame) {
  if (game.draw) return { label: t("Égalité", "Draw"), tone: "muted" };
  return game.won ? { label: t("Victoire", "Victory"), tone: "win" } : { label: t("Défaite", "Defeat"), tone: "bad" };
}

export function MapHistoryView({ history, mapName, season, onOpenRound }: Props) {
  const games = useMemo(() => new Map(history.games.map((game) => [game.matchId, game])), [history.games]);
  const acts = useMemo(() => {
    const counts = new Map<string, number>();
    history.games.forEach((game) => {
      if (game.season) counts.set(game.season, (counts.get(game.season) ?? 0) + 1);
    });
    return [...counts.entries()].map(([value, count]) => ({ value, label: seasonLabel(value), count }));
  }, [history.games]);
  const agents = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    history.games.forEach((game) => {
      if (!game.agentId) return;
      const entry = counts.get(game.agentId) ?? { name: game.agentName ?? t("Agent inconnu", "Unknown agent"), count: 0 };
      entry.count += 1;
      counts.set(game.agentId, entry);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([value, entry]) => ({ value, label: entry.name, count: entry.count, image: agentIcon(value) }));
  }, [history.games]);

  const [kind, setKind] = useState<Kind>("death");
  const initial = useMemo<Filters>(
    () => ({ ...NO_FILTERS, act: season && history.games.some((game) => game.season === season) ? season : null }),
    [season, history.games],
  );
  const [filters, setFilters] = useState<Filters>(initial);
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const pageVisible = usePageVisible();
  const catalog = useAgentCatalog();

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setVisible(PAGE);
    setOpen(null);
  };

  const changeKind = (next: Kind) => {
    setKind(next);
    setVisible(PAGE);
    setOpen(null);
  };

  const base = useMemo(
    () =>
      history.actions.filter((action) => {
        const game = games.get(action.matchId);
        return (
          (filters.side === null || action.attack === (filters.side === "attack")) &&
          (filters.phase === null || action.phase === filters.phase) &&
          (filters.result === null || action.roundWon === (filters.result === "won")) &&
          (filters.agent === null || game?.agentId === filters.agent) &&
          (filters.act === null || game?.season === filters.act)
        );
      }),
    [history.actions, games, filters.side, filters.phase, filters.result, filters.agent, filters.act],
  );

  const zoneStats = useMemo(() => {
    const stats = new Map<string, { deaths: number; kills: number }>();
    base.forEach((action) => {
      if (!action.zone) return;
      const entry = stats.get(action.zone) ?? { deaths: 0, kills: 0 };
      if (action.kind === "death") entry.deaths += 1;
      else entry.kills += 1;
      stats.set(action.zone, entry);
    });
    return stats;
  }, [base]);

  const ofKind = useMemo(() => base.filter((action) => action.kind === kind), [base, kind]);
  const list = useMemo(() => (filters.zone === null ? ofKind : ofKind.filter((action) => action.zone === filters.zone)), [ofKind, filters.zone]);
  const deaths = base.filter((action) => action.kind === "death").length;
  const kills = base.length - deaths;

  const countOf = (name: string) => {
    const entry = zoneStats.get(name);
    return entry ? (kind === "death" ? entry.deaths : entry.kills) : 0;
  };
  const ranked = [...zoneStats.keys()].filter((name) => countOf(name) > 0).sort((a, b) => countOf(b) - countOf(a));
  const top = countOf(ranked[0] ?? "") || 1;
  const zoneTable = useSort(`map-zones-${kind}`, ranked, {
    zone: { value: (name) => name },
    deaths: { value: (name) => zoneStats.get(name)?.deaths ?? 0 },
    kills: { value: (name) => zoneStats.get(name)?.kills ?? 0 },
  }, { key: kind === "death" ? "deaths" : "kills", dir: "desc" });
  const bubbles = history.zones
    .filter((zone) => countOf(zone.name) > 0)
    .map((zone) => ({ ...zone, ...rotatePoint(zone, history.rotation), count: countOf(zone.name) }))
    .sort((a, b) => a.count - b.count);
  const dots = useMemo(
    () =>
      ofKind
        .map((action) => ({ action, point: spot(action) }))
        .filter((entry): entry is { action: MapAction; point: Point } => entry.point !== null)
        .map(({ action, point }) => ({ zone: action.zone, ...rotatePoint(point, history.rotation) })),
    [ofKind, history.rotation],
  );

  const zoneOptions: PillOption<string>[] = ranked.map((name) => ({ value: name, label: name, count: countOf(name) }));
  if (filters.zone !== null && !ranked.includes(filters.zone)) zoneOptions.push({ value: filters.zone, label: filters.zone, count: 0 });
  const filtered = (Object.keys(filters) as (keyof Filters)[]).some((key) => filters[key] !== initial[key]);
  const toggleZone = (name: string) => update({ zone: filters.zone === name ? null : name });
  const shown = list.slice(0, visible);
  const current = open === null ? null : (list[open] ?? null);

  return (
    <div className="maphist">
      <div className="maphist-side">
        <div className={`minimap maphist-map${filters.zone ? " has-focus" : ""}`}>
          {history.minimap && (
            <img src={history.minimap} alt={t(`Minimap de ${mapName}`, `${mapName} minimap`)} width={1024} height={1024} decoding="async" {...fadeIn} style={rotationStyle(history.rotation)} />
          )}
          <PointCanvas points={dots} focus={filters.zone} className={`maphist-dots ${kind}`} opacity={0.75} focusScale={1.6} bleed={4} />
          {bubbles.map((zone) => {
            const stats = zoneStats.get(zone.name);
            const size = Math.round(22 + 18 * Math.sqrt(zone.count / top));
            return (
              <button
                key={zone.name}
                type="button"
                className={`maphist-zone ${kind}${filters.zone === zone.name ? " active" : ""}`}
                style={{ left: pctOf(zone.x), top: pctOf(zone.y), width: size, height: size }}
                aria-pressed={filters.zone === zone.name}
                aria-label={`${zone.name}, ${deathCount(stats?.deaths ?? 0)}, ${killCount(stats?.kills ?? 0)}`}
                onClick={() => toggleZone(zone.name)}
              >
                {zone.count}
                <span className="maphist-zone-name">
                  <strong>{zone.name}</strong>
                  <span>
                    {deathCount(stats?.deaths ?? 0)}, {killCount(stats?.kills ?? 0)}
                  </span>
                </span>
              </button>
            );
          })}
          {!history.minimap && <span className="minimap-empty">{t("Minimap indisponible, relance une synchro", "Minimap unavailable, run a sync again")}</span>}
        </div>

        <div className="stack" style={{ gap: 2 }}>
          <div className="row between maphist-zones-head">
            <SortHeader table={zoneTable} column="zone" className="label">
              {kind === "death" ? t("Où tu meurs le plus", "Where you die most") : t("Où tu tues le plus", "Where you kill most")}
            </SortHeader>
            <span className="faint maphist-zones-cols">
              <SortHeader table={zoneTable} column="deaths">{t("Morts", "Deaths")}</SortHeader>
              <SortHeader table={zoneTable} column="kills">Kills</SortHeader>
            </span>
          </div>
          {ranked.length === 0 && <span className="faint">{t("Aucune zone avec ces filtres.", "No zone with these filters.")}</span>}
          {zoneTable.rows.slice(0, TOP_ZONES).map((name) => {
            const stats = zoneStats.get(name);
            return (
              <button
                key={name}
                type="button"
                className={`maphist-zone-row${filters.zone === name ? " active" : ""}`}
                aria-pressed={filters.zone === name}
                onClick={() => toggleZone(name)}
              >
                <span className="ellipsis">{name}</span>
                <span className="maphist-zones-cols">
                  <strong className="bad">{stats?.deaths ?? 0}</strong>
                  <strong className="good">{stats?.kills ?? 0}</strong>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="maphist-main">
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="segmented" role="group" aria-label={t("Afficher", "Show")}>
            <button type="button" className={kind === "death" ? "active" : undefined} onClick={() => changeKind("death")}>
              {t("Mes morts", "My deaths")} <span className="chip-count">{deaths}</span>
            </button>
            <button type="button" className={kind === "kill" ? "active" : undefined} onClick={() => changeKind("kill")}>
              {t("Mes kills", "My kills")} <span className="chip-count">{kills}</span>
            </button>
          </div>
          <span className="faint">
            {kind === "death" ? deathCount(list.length) : killCount(list.length)} {t("avec ces filtres", "with these filters")}
          </span>
        </div>

        <div className="chips" role="group" aria-label={t("Filtres", "Filters")}>
          <FilterPill label={t("Côté", "Side")} allLabel={t("Les deux côtés", "Both sides")} value={filters.side} options={SIDES()} onChange={(side) => update({ side })} />
          <FilterPill label={t("Moment", "Timing")} allLabel={t("Tout le round", "Whole round")} value={filters.phase} options={PHASES()} onChange={(phase) => update({ phase })} />
          <FilterPill label={t("Round", "Round")} allLabel={t("Tous les rounds", "All rounds")} value={filters.result} options={RESULTS()} onChange={(result) => update({ result })} />
          {agents.length > 1 && (
            <FilterPill label="Agent" allLabel={t("Tous les agents", "All agents")} value={filters.agent} options={agents} onChange={(agent) => update({ agent })} />
          )}
          <FilterPill label="Zone" allLabel={t("Toutes les zones", "All zones")} value={filters.zone} options={zoneOptions} onChange={(zone) => update({ zone })} />
          {acts.length > 1 && (
            <FilterPill label={t("Acte", "Act")} allLabel={t("Tous les actes", "All acts")} value={filters.act} options={acts} onChange={(act) => update({ act })} />
          )}
          {filtered && (
            <button type="button" className="chip filter-reset" onClick={() => update(initial)}>
              <Icon name="close" size={14} strokeWidth={2} />
              {t("Réinitialiser", "Reset")}
            </button>
          )}
        </div>

        {history.total > history.games.length && (
          <span className="hint">
            {t(
              `Historique limité à tes ${history.games.length} derniers matchs sur ${mapName}.`,
              `History limited to your last ${history.games.length} matches on ${mapName}.`,
            )}
          </span>
        )}

        <div className="maphist-list" role="group" aria-label={kind === "death" ? t("Tes morts sur cette map", "Your deaths on this map") : t("Tes kills sur cette map", "Your kills on this map")}>
          {list.length === 0 && <div className="empty">{t("Rien à afficher avec ces filtres.", "Nothing to show with these filters.")}</div>}
          {shown.map((action, index) => (
            <ActionRow
              key={`${action.matchId}-${action.round}-${action.timeS}-${action.kind}`}
              action={action}
              game={games.get(action.matchId)}
              catalog={catalog}
              onOpen={() => setOpen(index)}
            />
          ))}
          {list.length > visible && (
            <button type="button" className="btn btn-secondary maphist-more" onClick={() => setVisible((count) => count + PAGE)}>
              {t(`Afficher plus (${list.length - visible} restants)`, `Show more (${list.length - visible} left)`)}
            </button>
          )}
        </div>
      </div>

      {current && open !== null && pageVisible && (
        <ActionModal
          action={current}
          game={games.get(current.matchId)}
          minimap={history.minimap}
          rotation={history.rotation}
          position={open}
          count={list.length}
          catalog={catalog}
          onMove={(step) => {
            const next = (open + step + list.length) % list.length;
            if (next >= visible) setVisible(next + 1);
            setOpen(next);
          }}
          onClose={() => setOpen(null)}
          onOpenRound={onOpenRound}
        />
      )}
    </div>
  );
}

function ActionRow({ action, game, catalog, onOpen }: { action: MapAction; game: MapGame | undefined; catalog: Catalog | null; onOpen: () => void }) {
  const death = action.kind === "death";
  return (
    <button type="button" className="maphist-row" onClick={onOpen}>
      <span className="maphist-when">
        <strong>{shortDate(game?.startedAt)}</strong>
        <span className="faint">
          R{action.round + 1} {shortSide(action.attack)}
        </span>
      </span>
      <Art src={agentIcon(game?.agentId)} width={28} height={28} alt={game?.agentName ?? ""} className="maphist-face" />
      <span className="maphist-who">
        <Art src={agentIcon(action.opponentAgentId)} width={28} height={28} alt="" className="maphist-face" />
        <span className="stack" style={{ gap: 0, minWidth: 0 }}>
          <strong className="ellipsis">{action.opponent}</strong>
          <span className="faint ellipsis">
            {action.zone ?? t("Zone inconnue", "Unknown zone")}, {clock(action.timeS)}
          </span>
        </span>
      </span>
      <span className="maphist-weapon">
        <KillMeans
          weaponId={action.weaponId}
          weaponName={action.weapon}
          weaponKind={action.weaponKind}
          agentId={death ? action.opponentAgentId : game?.agentId}
          catalog={catalog}
          height={20}
          bare
        />
      </span>
      <span className="maphist-tags" title={death ? action.flaws.join("\n") : undefined}>
        {death
          ? action.flaws.map((flaw) => <i key={flaw} className="bad-dot" />)
          : action.first && <span className="faint">{t("1er kill", "1st kill")}</span>}
      </span>
      <span className={`maphist-result ${action.roundWon ? "win" : "bad"}`}>{action.roundWon ? t("Gagné", "Won") : t("Perdu", "Lost")}</span>
    </button>
  );
}

type ModalProps = {
  action: MapAction;
  game: MapGame | undefined;
  minimap: string | null;
  rotation: number;
  position: number;
  count: number;
  catalog: Catalog | null;
  onMove: (step: number) => void;
  onClose: () => void;
  onOpenRound?: (matchId: string, roundIndex: number) => void;
};

function ActionModal({ action, game, minimap, rotation, position, count, catalog, onMove, onClose, onOpenRound }: ModalProps) {
  const death = action.kind === "death";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onMove(1);
      if (event.key === "ArrowLeft") onMove(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onMove]);

  const me = action.mePosition ? rotatePoint(action.mePosition, rotation) : null;
  const opponent = action.opponentPosition ? rotatePoint(action.opponentPosition, rotation) : null;
  const result = game ? matchResult(game) : null;
  const means =
    (action.weaponKind === "ability" ? findAbility(catalog, action.weapon, death ? action.opponentAgentId : game?.agentId)?.label : null) ??
    meansLabel(action.weapon, action.weaponKind);
  const title = death ? t(`Mort ${position + 1} sur ${count}`, `Death ${position + 1} of ${count}`) : t(`Kill ${position + 1} sur ${count}`, `Kill ${position + 1} of ${count}`);

  return createPortal(
    <div className="maphist-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="maphist-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="maphist-modal-head">
          <div className="stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="faint">{title}</span>
            <h2 className="maphist-modal-title">
              Round {action.round + 1}, {sideLabel(action.attack).toLowerCase()}
            </h2>
            <span className="muted">
              {action.zone ?? t("Zone inconnue", "Unknown zone")}, {t("à", "at")} {clock(action.timeS)},{" "}
              <strong className={action.roundWon ? "win" : "bad"}>{action.roundWon ? t("round gagné", "round won") : t("round perdu", "round lost")}</strong>
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="icon-btn round-lg" onClick={() => onMove(-1)} aria-label={t("Précédent", "Previous")} disabled={count < 2}>
              <Icon name="arrowRight" size={16} strokeWidth={2} className="flip" />
            </button>
            <button type="button" className="icon-btn round-lg" onClick={() => onMove(1)} aria-label={t("Suivant", "Next")} disabled={count < 2}>
              <Icon name="arrowRight" size={16} strokeWidth={2} />
            </button>
            <button type="button" className="icon-btn round-lg" onClick={onClose} aria-label={t("Fermer", "Close")} autoFocus>
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="maphist-modal-body">
          <div className="stack" style={{ gap: 10 }}>
            <div className="minimap maphist-modal-map">
              {minimap && <img src={minimap} alt={t("Minimap", "Minimap")} width={1024} height={1024} decoding="async" {...fadeIn} style={rotationStyle(rotation)} />}
              {me || opponent ? (
                <>
                  {me && opponent && (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <line x1={opponent.x * 100} y1={opponent.y * 100} x2={me.x * 100} y2={me.y * 100} />
                    </svg>
                  )}
                  {opponent && (
                    <>
                      <span className={`marker ${death ? "killer" : "enemy"}`} style={{ left: pctOf(opponent.x), top: pctOf(opponent.y) }} />
                      <span className="marker-label killer" style={{ left: pctOf(opponent.x), top: pctOf(opponent.y) }}>
                        {action.opponent}
                      </span>
                    </>
                  )}
                  {me && (
                    <>
                      <span className="marker me" style={{ left: pctOf(me.x), top: pctOf(me.y) }}>
                        {death && <Icon name="close" size={11} strokeWidth={3} />}
                      </span>
                      <span className="marker-label" style={{ left: pctOf(me.x), top: pctOf(me.y) }}>
                        {t("Toi", "You")}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span className="minimap-empty">{t("Positions indisponibles", "Positions unavailable")}</span>
              )}
            </div>
            {death && !opponent && me && <span className="faint" style={{ fontSize: 12 }}>{t("Position du tueur inconnue.", "Killer position unknown.")}</span>}
            {!death && !me && opponent && <span className="faint" style={{ fontSize: 12 }}>{t("Ta position est inconnue.", "Your position is unknown.")}</span>}
          </div>

          <div className="stack" style={{ gap: 18, minWidth: 0 }}>
            <div className="review-killer">
              <Art src={agentIcon(action.opponentAgentId)} width={44} height={44} alt="" className="review-killer-agent" />
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <span className="faint" style={{ fontSize: 12 }}>
                  {death ? t("Tué par", "Killed by") : t("Tu as tué", "You killed")}
                </span>
                <strong className="ellipsis">{action.opponent}</strong>
              </span>
              <span className="review-killer-weapon">
                <KillMeans
                  weaponId={action.weaponId}
                  weaponName={action.weapon}
                  weaponKind={action.weaponKind}
                  agentId={death ? action.opponentAgentId : game?.agentId}
                  catalog={catalog}
                  height={26}
                  bare
                />
                <span className="faint ellipsis" style={{ fontSize: 12 }}>
                  {means}
                </span>
              </span>
            </div>

            {death ? (
              <div className="stack" style={{ gap: 10 }}>
                <span className="maphist-modal-sub">{t("Défauts détectés", "Detected flaws")}</span>
                {action.flaws.length === 0 && <span className="good">{t("Aucun défaut détecté sur cette mort", "No flaws detected on this death")}</span>}
                {action.flaws.map((flaw) => (
                  <span className="flaw-line" key={flaw}>
                    <i className="bad-dot" />
                    {flaw}
                  </span>
                ))}
                {action.positives.map((positive) => (
                  <span className="flaw-line" key={positive}>
                    <i className="good-dot" />
                    {positive}
                  </span>
                ))}
              </div>
            ) : (
              action.first && (
                <span className="flaw-line">
                  <i className="good-dot" />
                  {t("Premier kill du round", "First kill of the round")}
                </span>
              )
            )}
          </div>
        </div>

        {game && result && (
          <footer className="maphist-modal-match">
            <Art src={agentIcon(game.agentId)} width={40} height={40} alt={game.agentName ?? ""} className="maphist-modal-agent" />
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <strong className={result.tone}>
                {result.label} {game.roundsWon}-{game.roundsLost}
              </strong>
              <span className="faint ellipsis">
                {fullDate(game.startedAt)}
                {game.agentName ? `, ${game.agentName}` : ""}
              </span>
            </span>
            <span className="maphist-modal-stat">
              <span className="faint">K / D / A</span>
              <strong>
                {game.kills} / {game.deaths} / {game.assists}
              </strong>
            </span>
            <span className="maphist-modal-stat">
              <span className="faint">ACS</span>
              <strong>{fmt(game.acs)}</strong>
            </span>
            {onOpenRound && (
              <button type="button" className="btn btn-primary" onClick={() => onOpenRound(action.matchId, action.round)}>
                {t("Ouvrir le match au round", "Open the match at this round")}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
