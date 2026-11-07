import "../styles/rounds.css";
import { useEffect, useState } from "react";
import type { RoundEvent, RoundLine } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { clock, fmt } from "../lib/format";
import { findAbility, useAgentCatalog, weaponArt, type Catalog } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { rotatePoint, rotationStyle } from "../lib/minimap";
import { FavoriteButton } from "./FavoriteButton";
import { Art, KillMeans, meansLabel, SpikeGlyph } from "./GameArt";
import { Icon } from "./Icon";

const ARMOR: Record<string, string> = {
  "Heavy Armor": "Bouclier lourd",
  "Light Armor": "Bouclier léger",
  "Regen Shield": "Bouclier régénérant",
};

type Pane = "events" | "economy";

type Props = {
  puuid: string;
  matchId: string;
  rounds: RoundLine[];
  selected: number;
  onSelect: (index: number) => void;
  minimap: string | null;
  rotation: number;
};

const pctOf = (value: number) => `${value * 100}%`;
const tone = (ally: boolean) => (ally ? "ally" : "enemy");

export function RoundDetail({ puuid, matchId, rounds, selected, onSelect, minimap, rotation }: Props) {
  const index = Math.min(selected, rounds.length - 1);
  const round = rounds[index];
  const catalog = useAgentCatalog();
  const [pane, setPane] = useState<Pane>("events");
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  useEffect(() => {
    setHover(null);
    setPinned(null);
  }, [index]);

  if (!round) return <div className="empty">{t("Aucun round à afficher.", "No rounds to show.")}</div>;

  const focus = hover ?? pinned;
  const pick = (event: number) => setPinned((current) => (current === event ? null : event));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="round-picker" role="group" aria-label={t("Choisir un round", "Pick a round")}>
        {rounds.map((item, index) => (
          <button
            type="button"
            key={item.number}
            className={`${item.won ? "won" : "lost"}${index === selected ? " active" : ""}`}
            onClick={() => onSelect(index)}
            aria-pressed={index === selected}
            title={t(`Round ${item.number}, ${item.won ? "gagné" : "perdu"}`, `Round ${item.number}, ${item.won ? "won" : "lost"}`)}
          >
            {item.number}
          </button>
        ))}
      </div>

      <div className="round-layout">
        <RoundMap
          events={round.events}
          minimap={minimap}
          rotation={rotation}
          focus={focus}
          catalog={catalog}
          onHover={setHover}
          onPick={pick}
        />

        <section className="stack" style={{ gap: 12, minWidth: 0 }}>
          <div className="row between" style={{ alignItems: "flex-start", gap: 16 }}>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <span className="review-title">
                Round {round.number}, {round.attack ? t("attaque", "attack") : t("défense", "defense")}
              </span>
              <span className="muted">
                <strong className={round.won ? "win" : "bad"}>{round.won ? t("Gagné", "Won") : t("Perdu", "Lost")}</strong>, {round.result.toLowerCase()}
                {round.ceremony ? `, ${round.ceremony}` : ""}
              </span>
            </div>
            <FavoriteButton puuid={puuid} matchId={matchId} kind="round" roundIndex={index} />
          </div>
          <div className="segmented" role="tablist" aria-label={t("Détail du round", "Round details")} style={{ alignSelf: "flex-start" }}>
            <button type="button" role="tab" aria-selected={pane === "events"} className={pane === "events" ? "active" : undefined} onClick={() => setPane("events")}>
              {t("Actions", "Events")} <span className="chip-count">{round.events.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={pane === "economy"} className={pane === "economy" ? "active" : undefined} onClick={() => setPane("economy")}>
              {t("Économie", "Economy")}
            </button>
          </div>

          {pane === "events" && (
            <>
              {round.events.length === 0 && <span className="faint">{t("Aucune action enregistrée.", "No events recorded.")}</span>}
              <div className="events round-feed">
                {round.events.map((event, i) => (
                  <EventRow
                    key={i}
                    event={event}
                    catalog={catalog}
                    active={focus === i}
                    onEnter={() => setHover(i)}
                    onLeave={() => setHover(null)}
                    onPick={() => pick(i)}
                  />
                ))}
              </div>
            </>
          )}

          {pane === "economy" && (
            <div className="economy round-economy">
              {round.economy.map((line) => (
                <div key={line.name} className={`economy-row${line.me ? " me" : ""}`}>
                  <Art src={agentIcon(line.agentId)} width={32} height={32} alt="" />
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <strong className={`ellipsis ${line.ally ? "ally-text" : "enemy-text"}`}>{line.name}</strong>
                    <span className="faint ellipsis" style={{ fontSize: 12 }}>
                      {line.weapon ?? t("Arme de base", "Starting weapon")}
                      {line.armor ? `, ${t(ARMOR[line.armor] ?? line.armor, line.armor)}` : ""}
                    </span>
                  </span>
                  <span className="round-economy-weapon">
                    {line.weaponId && <Art src={weaponArt(line.weaponId, "killstreamicon")} width={72} height={24} alt={line.weapon ?? ""} mono />}
                  </span>
                  <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                    <strong>{fmt(line.loadout)}</strong>
                    <span className="faint" style={{ fontSize: 12 }}>
                      {t(`reste ${fmt(line.remaining)}`, `${fmt(line.remaining)} left`)}
                    </span>
                  </span>
                  <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                    <strong>
                      {line.kills} {t(`kill${line.kills > 1 ? "s" : ""}`, line.kills === 1 ? "kill" : "kills")}
                    </strong>
                    <span className="faint" style={{ fontSize: 12 }}>
                      {t(`${fmt(line.damage)} dégâts`, `${fmt(line.damage)} damage`)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type MapProps = {
  events: RoundEvent[];
  minimap: string | null;
  rotation: number;
  focus: number | null;
  catalog: Catalog | null;
  onHover: (index: number | null) => void;
  onPick: (index: number) => void;
};

function actionText(event: RoundEvent) {
  if (event.kind === "kill") {
    if (event.actorMe) return t(`Tu tues ${event.target}`, `You kill ${event.target}`);
    if (event.targetMe) return t(`${event.actor} te tue`, `${event.actor} kills you`);
    return t(`${event.actor} tue ${event.target}`, `${event.actor} kills ${event.target}`);
  }
  const site = event.site ? t(` sur ${event.site}`, ` on ${event.site}`) : "";
  if (event.kind === "plant") return event.actorMe ? t(`Tu poses le spike${site}`, `You plant the Spike${site}`) : t(`${event.actor} pose le spike${site}`, `${event.actor} plants the Spike${site}`);
  return event.actorMe ? t("Tu désamorces le spike", "You defuse the Spike") : t(`${event.actor} désamorce le spike`, `${event.actor} defuses the Spike`);
}

function RoundMap({ events, minimap, rotation, focus, catalog, onHover, onPick }: MapProps) {
  const marks = events.flatMap((event, index) => {
    if (!event.position) return [];
    const at = rotatePoint(event.position, rotation);
    const from = event.kind === "kill" && event.actorPosition ? rotatePoint(event.actorPosition, rotation) : null;
    return [{ event, index, at, from }];
  });
  const shown = focus === null ? null : (marks.find((mark) => mark.index === focus) ?? null);
  const on = (index: number) => (focus === index ? " on" : "");

  return (
    <div className="stack" style={{ gap: 10, minWidth: 0 }}>
      <div className={`minimap round-map${shown ? " has-focus" : ""}`} onMouseLeave={() => onHover(null)}>
        {minimap && <img src={minimap} alt={t("Minimap", "Minimap")} style={rotationStyle(rotation)} />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {marks.map(
            (mark) =>
              mark.from && (
                <line
                  key={mark.index}
                  className={`${tone(mark.event.actorAlly)}${on(mark.index)}`}
                  x1={mark.from.x * 100}
                  y1={mark.from.y * 100}
                  x2={mark.at.x * 100}
                  y2={mark.at.y * 100}
                />
              ),
          )}
        </svg>
        {marks.map(
          (mark) =>
            mark.from && (
              <span
                key={`from-${mark.index}`}
                className={`round-map-from ${tone(mark.event.actorAlly)}${mark.event.actorMe ? " me" : ""}${on(mark.index)}`}
                style={{ left: pctOf(mark.from.x), top: pctOf(mark.from.y) }}
              />
            ),
        )}
        {marks.map((mark) => {
          const kill = mark.event.kind === "kill";
          const me = kill ? mark.event.targetMe : mark.event.actorMe;
          const classes = kill ? `kill ${tone(mark.event.targetAlly)}` : mark.event.kind;
          return (
            <button
              key={mark.index}
              type="button"
              className={`round-map-mark ${classes}${me ? " me" : ""}${on(mark.index)}`}
              style={{ left: pctOf(mark.at.x), top: pctOf(mark.at.y) }}
              aria-label={`${clock(mark.event.timeS)}, ${actionText(mark.event)}`}
              onMouseEnter={() => onHover(mark.index)}
              onFocus={() => onHover(mark.index)}
              onBlur={() => onHover(null)}
              onClick={() => onPick(mark.index)}
            >
              {kill ? <Icon name="close" size={10} strokeWidth={3.2} /> : <SpikeGlyph size={14} />}
            </button>
          );
        })}
        {shown && <MapTip event={shown.event} x={shown.at.x} y={shown.at.y} catalog={catalog} />}
        {!minimap && <span className="minimap-empty">{t("Minimap indisponible, relance une synchro", "Minimap unavailable, run a sync again")}</span>}
        {minimap && marks.length === 0 && events.length > 0 && (
          <span className="minimap-empty">{t("Positions indisponibles pour ce round", "Positions unavailable for this round")}</span>
        )}
      </div>
      <div className="legend">
        <span><i className="ally" />{t("Ton équipe", "Your team")}</span>
        <span><i className="enemy" />{t("En face", "Enemies")}</span>
        <span>{t("Croix : mort, point : position du tueur", "Cross: death, dot: killer position")}</span>
      </div>
    </div>
  );
}

function MapTip({ event, x, y, catalog }: { event: RoundEvent; x: number; y: number; catalog: Catalog | null }) {
  const means =
    event.kind === "kill"
      ? ((event.weaponKind === "ability" ? findAbility(catalog, event.weapon, event.actorAgentId)?.label : null) ?? meansLabel(event.weapon, event.weaponKind))
      : null;
  return (
    <span className={`round-map-tip${x > 0.6 ? " flip" : ""}`} style={{ left: pctOf(x), top: pctOf(y) }} role="status">
      <span className="row" style={{ gap: 8 }}>
        <Art src={agentIcon(event.actorAgentId)} width={22} height={22} alt="" className="round-map-tip-face" />
        <strong>{actionText(event)}</strong>
        {event.kind === "kill" && <Art src={agentIcon(event.targetAgentId)} width={22} height={22} alt="" className="round-map-tip-face" />}
      </span>
      <span className="faint">
        {clock(event.timeS)}
        {means ? `, ${means}` : ""}
      </span>
    </span>
  );
}

function Who({ name, agentId, ally, me }: { name: string; agentId: string | null; ally: boolean; me: boolean }) {
  return (
    <span className="who">
      <Art src={agentIcon(agentId)} width={24} height={24} alt="" />
      <strong className={`ellipsis ${me ? "me-text" : ally ? "ally-text" : "enemy-text"}`}>{me ? t("Toi", "You") : name}</strong>
    </span>
  );
}

type RowProps = {
  event: RoundEvent;
  catalog: Catalog | null;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPick: () => void;
};

function EventRow({ event, catalog, active, onEnter, onLeave, onPick }: RowProps) {
  const mine = event.actorMe || event.targetMe;
  const hooks = { onMouseEnter: onEnter, onMouseLeave: onLeave, onClick: onPick };
  if (event.kind === "kill" && event.target) {
    return (
      <div className={`event round-kill${mine ? " mine" : ""}${active ? " on" : ""}`} {...hooks}>
        <span className="faint event-time">{clock(event.timeS)}</span>
        <span className="round-kill-actor">
          <Who name={event.actor} agentId={event.actorAgentId} ally={event.actorAlly} me={event.actorMe} />
        </span>
        <KillMeans
          weaponId={event.weaponId}
          weaponName={event.weapon}
          weaponKind={event.weaponKind}
          agentId={event.actorAgentId}
          catalog={catalog}
        />
        <span className="round-kill-target">
          <Who name={event.target} agentId={event.targetAgentId} ally={event.targetAlly} me={event.targetMe} />
        </span>
      </div>
    );
  }
  return (
    <div className={`event round-spike${mine ? " mine" : ""}${active ? " on" : ""}`} {...hooks}>
      <span className="faint event-time">{clock(event.timeS)}</span>
      <SpikeGlyph size={20} className={event.kind === "defuse" ? "round-spike-defuse" : undefined} />
      <Who name={event.actor} agentId={event.actorAgentId} ally={event.actorAlly} me={event.actorMe} />
      <span className="muted">
        {event.kind === "plant"
          ? t(`pose le spike${event.site ? ` sur ${event.site}` : ""}`, `plants the Spike${event.site ? ` on ${event.site}` : ""}`)
          : t("désamorce le spike", "defuses the Spike")}
      </span>
    </div>
  );
}
