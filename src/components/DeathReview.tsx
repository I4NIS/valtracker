import "../styles/rounds.css";
import { useEffect, useMemo, useState } from "react";
import type { Death } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt } from "../lib/format";
import { findAbility, useAgentCatalog } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { rotatePoint, rotationStyle } from "../lib/minimap";
import { FavoriteButton } from "./FavoriteButton";
import { Art, KillMeans, meansLabel } from "./GameArt";
import { Icon } from "./Icon";

type Order = "gravity" | "chrono";

type Props = {
  puuid: string;
  matchId: string;
  deaths: Death[];
  minimap: string | null;
  rotation: number;
  focusRound?: number;
};

const pctOf = (value: number) => `${value * 100}%`;

function sortDeaths(deaths: Death[], order: Order) {
  return order === "gravity" ? [...deaths].sort((a, b) => b.flaws.length - a.flaws.length || a.round - b.round) : deaths;
}

export function DeathReview({ puuid, matchId, deaths, minimap, rotation, focusRound }: Props) {
  const [order, setOrder] = useState<Order>("gravity");
  const [index, setIndex] = useState(() =>
    focusRound === undefined ? 0 : Math.max(0, sortDeaths(deaths, "gravity").findIndex((item) => item.round - 1 === focusRound)),
  );
  const catalog = useAgentCatalog();

  const list = useMemo(() => sortDeaths(deaths, order), [deaths, order]);
  const death = list[Math.min(index, list.length - 1)];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % list.length);
      if (event.key === "ArrowLeft") setIndex((i) => (i + list.length - 1) % list.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list.length]);

  if (!death) return <div className="empty">{t("Aucune mort sur ce match. Rien à revoir.", "No deaths this match. Nothing to review.")}</div>;

  const position = death.position ? rotatePoint(death.position, rotation) : null;
  const killerPosition = death.killerPosition ? rotatePoint(death.killerPosition, rotation) : null;
  const others = death.others.map((marker) => ({ ally: marker.ally, ...rotatePoint(marker, rotation) }));

  const facts: [string, string][] = [
    [t("Distance", "Distance"), death.distanceM !== null ? `${fmt(death.distanceM)} m` : t("Inconnue", "Unknown")],
    [t("Coéquipier le plus proche", "Nearest teammate"), death.nearestAllyM !== null ? `${fmt(death.nearestAllyM)} m` : t("Aucun en vie", "None alive")],
    [t("Ton équipement", "Your loadout"), t(`${fmt(death.loadout)} crédits`, `${fmt(death.loadout)} credits`)],
  ];

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="row between wrap">
        <span className="faint">
          {t(
            `Tes ${deaths.length} morts, une par une. Flèches du clavier pour naviguer.`,
            `Your ${deaths.length} ${deaths.length === 1 ? "death" : "deaths"}, one by one. Use the arrow keys to navigate.`,
          )}
        </span>
        <div className="segmented" role="group" aria-label={t("Ordre des morts", "Death order")}>
          <button type="button" className={order === "gravity" ? "active" : undefined} onClick={() => { setOrder("gravity"); setIndex(0); }}>
            {t("Les plus lourdes d'abord", "Worst first")}
          </button>
          <button type="button" className={order === "chrono" ? "active" : undefined} onClick={() => { setOrder("chrono"); setIndex(0); }}>
            {t("Dans l'ordre", "In order")}
          </button>
        </div>
      </div>

      <div className="review">
        <div className="stack" style={{ gap: 12 }}>
          <div className="minimap">
            {minimap && <img src={minimap} alt={t("Minimap", "Minimap")} style={rotationStyle(rotation)} />}
            {position ? (
              <>
                {killerPosition && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <line x1={killerPosition.x * 100} y1={killerPosition.y * 100} x2={position.x * 100} y2={position.y * 100} />
                  </svg>
                )}
                {others.map((marker, i) => (
                  <span key={i} className={`marker ${marker.ally ? "ally" : "enemy"}`} style={{ left: pctOf(marker.x), top: pctOf(marker.y) }} />
                ))}
                {killerPosition && (
                  <>
                    <span className="marker killer" style={{ left: pctOf(killerPosition.x), top: pctOf(killerPosition.y) }} />
                    <span className="marker-label killer" style={{ left: pctOf(killerPosition.x), top: pctOf(killerPosition.y) }}>
                      {death.killerName}
                    </span>
                  </>
                )}
                <span className="marker me" style={{ left: pctOf(position.x), top: pctOf(position.y) }}>
                  <Icon name="close" size={11} strokeWidth={3} />
                </span>
                <span className="marker-label" style={{ left: pctOf(position.x), top: pctOf(position.y) }}>
                  {t("Toi", "You")}
                </span>
              </>
            ) : (
              <span className="minimap-empty">{t("Positions indisponibles pour cette map", "Positions unavailable for this map")}</span>
            )}
          </div>
          <div className="legend">
            <span><i className="ally" />{t("Coéquipiers", "Teammates")}</span>
            <span><i className="enemy" />{t("Ennemis", "Enemies")}</span>
            <span><i className="killer" />{t("Ton tueur", "Your killer")}</span>
            <span>{t("Positions au moment de ta mort", "Positions at the moment of your death")}</span>
          </div>
        </div>

        <div className="stack" style={{ gap: 22 }}>
          <div className="row between">
            <span className="faint">
              {t(
                `Mort ${Math.min(index, list.length - 1) + 1} sur ${list.length}`,
                `Death ${Math.min(index, list.length - 1) + 1} of ${list.length}`,
              )}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="icon-btn round-lg" onClick={() => setIndex((i) => (i + list.length - 1) % list.length)} aria-label={t("Mort précédente", "Previous death")}>
                <Icon name="arrowRight" size={16} strokeWidth={2} className="flip" />
              </button>
              <button type="button" className="icon-btn round-lg primary" onClick={() => setIndex((i) => (i + 1) % list.length)} aria-label={t("Mort suivante", "Next death")}>
                <Icon name="arrowRight" size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="row between" style={{ alignItems: "flex-start", gap: 16 }}>
            <div className="stack" style={{ minWidth: 0 }}>
              <span className="review-title">
                Round {death.round}, {death.attack ? t("attaque", "attack") : t("défense", "defense")}
              </span>
              <span className="muted">
                {death.zone ?? t("Zone inconnue", "Unknown zone")}, {t("à", "at")} {fmt(death.timeS, 1)} s,{" "}
                {death.roundWon ? t("round gagné", "round won") : t("round perdu", "round lost")}
              </span>
            </div>
            <FavoriteButton puuid={puuid} matchId={matchId} kind="death" roundIndex={death.round - 1} />
          </div>
          <div className="review-killer">
            <Art src={agentIcon(death.killerAgentId)} width={44} height={44} alt="" className="review-killer-agent" />
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <span className="faint" style={{ fontSize: 12 }}>
                {t("Tué par", "Killed by")}
              </span>
              <strong className="ellipsis">
                {death.killerName}
                {death.killerAgent ? <span className="faint">, {death.killerAgent}</span> : null}
              </strong>
            </span>
            <span className="review-killer-weapon">
              <KillMeans
                weaponId={death.weaponId}
                weaponName={death.weapon}
                weaponKind={death.weaponKind}
                agentId={death.killerAgentId}
                catalog={catalog}
                height={26}
                bare
              />
              <span className="faint ellipsis" style={{ fontSize: 12 }}>
                {(death.weaponKind === "ability" ? findAbility(catalog, death.weapon, death.killerAgentId)?.label : null) ?? meansLabel(death.weapon, death.weaponKind)}
              </span>
            </span>
          </div>
          <div className="facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <span className="faint">{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{t("Défauts détectés", "Detected flaws")}</span>
            {death.flaws.length === 0 && <span className="good">{t("Aucun défaut détecté sur cette mort", "No flaws detected on this death")}</span>}
            {death.flaws.map((flaw) => (
              <span className="flaw-line" key={flaw}>
                <i className="bad-dot" />
                {flaw}
              </span>
            ))}
            {death.positives.map((positive) => (
              <span className="flaw-line" key={positive}>
                <i className="good-dot" />
                {positive}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="death-strip" role="group" aria-label={t("Toutes tes morts", "All your deaths")}>
        {list.map((item, i) => (
          <button
            type="button"
            key={`${item.round}-${item.timeS}`}
            className={i === index ? "active" : undefined}
            onClick={() => setIndex(i)}
            aria-label={`Round ${item.round}`}
          >
            <span>R{item.round}</span>
            <span className="dots">
              {item.flaws.map((flaw) => (
                <i key={flaw} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
