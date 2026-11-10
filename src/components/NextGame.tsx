import "../styles/nextgame.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, pct } from "../lib/format";
import { t } from "../lib/i18n";
import { buildReport, getNextGame, MIN_SAMPLE, pickOptions, tierGap, winShare, type Rate } from "../lib/nextGame";
import { useQuery } from "../lib/query";
import { Icon } from "./Icon";

const ANY = "";

let rememberedMap = ANY;
let rememberedAgent = ANY;

const points = (delta: number) => {
  const size = Math.round(Math.abs(delta));
  return `${delta > 0 ? "+" : "-"}${fmt(size, 0)} ${size > 1 ? "pts" : "pt"}`;
};

const record = (rate: Rate) => t(`${rate.wins} V ${rate.losses} D`, `${rate.wins} W ${rate.losses} L`);

export function NextGameButton({ puuid }: { puuid: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        {t("Prochaine game", "Next game")}
      </button>
      {open && <NextGameDialog puuid={puuid} onClose={() => setOpen(false)} />}
    </>
  );
}

function NextGameDialog({ puuid, onClose }: { puuid: string; onClose: () => void }) {
  const query = useQuery({ key: `nextGame|${puuid}`, fetch: () => getNextGame(puuid) });
  const history = query.data ?? null;
  const [mapId, setMapId] = useState(rememberedMap);
  const [agentId, setAgentId] = useState(rememberedAgent);
  const dialogRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => (history ? pickOptions(history) : { maps: [], agents: [] }), [history]);
  const report = useMemo(() => (history ? buildReport(history, mapId || null, agentId || null, new Date()) : null), [history, mapId, agentId]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const overall = report ? winShare(report.overall) : null;

  return createPortal(
    <div className="nextgame-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="nextgame-dialog" role="dialog" aria-modal="true" aria-labelledby="nextgame-title" tabIndex={-1} ref={dialogRef}>
        <header className="nextgame-head">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="nextgame-title" className="nextgame-title">
              {t("Prochaine game", "Next game")}
            </h2>
            <span className="faint">
              {t("Ton taux de victoire dans des conditions pareilles, d'après tes matchs enregistrés.", "Your win rate in similar conditions, from your recorded matches.")}
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Fermer", "Close")}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="nextgame-picks">
          <label className="stack" style={{ gap: 4 }}>
            <span className="label">{t("Map", "Map")}</span>
            <select
              className="input"
              value={mapId}
              onChange={(event) => {
                rememberedMap = event.target.value;
                setMapId(event.target.value);
              }}
            >
              <option value={ANY}>{t("Peu importe", "Any map")}</option>
              {options.maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="label">{t("Agent", "Agent")}</span>
            <select
              className="input"
              value={agentId}
              onChange={(event) => {
                rememberedAgent = event.target.value;
                setAgentId(event.target.value);
              }}
            >
              <option value={ANY}>{t("Peu importe", "Any agent")}</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="nextgame-body">
          {query.error && !history && <p className="form-error">{query.error}</p>}
          {!history && !query.error && <span className="faint">{t("Chargement de tes matchs", "Loading your matches")}</span>}
          {report && overall === null && <span className="faint">{t("Aucun match compétitif enregistré.", "No competitive match recorded.")}</span>}
          {report && overall !== null && (
            <>
              <div className="nextgame-overall">
                <span className="label">{t("Sur tous tes matchs enregistrés", "Across all your recorded matches")}</span>
                <strong>{pct(overall, 0)}</strong>
                <span className="faint">{record(report.overall)}</span>
              </div>
              <ul className="nextgame-list">
                {report.conditions.map((condition) => {
                  const share = winShare(condition.rate);
                  const total = condition.rate.wins + condition.rate.losses;
                  const enough = share !== null && total >= MIN_SAMPLE;
                  const delta = enough ? share - overall : null;
                  return (
                    <li className="nextgame-row" key={condition.key}>
                      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <strong>{condition.title}</strong>
                        <span className="faint">{condition.detail}</span>
                      </div>
                      <div className="nextgame-value">
                        {enough ? (
                          <>
                            <strong className={delta !== null && Math.abs(delta) >= 1 ? (delta > 0 ? "good" : "bad") : undefined}>{pct(share, 0)}</strong>
                            <span className="faint">
                              {record(condition.rate)}
                              {delta !== null && Math.abs(delta) >= 1 && `, ${points(delta)}`}
                            </span>
                          </>
                        ) : (
                          <span className="faint">
                            {total === 0
                              ? t("Aucun match", "No match")
                              : t(`${total} match${total > 1 ? "s" : ""}, pas assez pour un taux`, `${total} ${total === 1 ? "match" : "matches"}, not enough for a rate`)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="faint nextgame-note">
                {report.lobby.allies !== null || report.lobby.enemies !== null
                  ? t(
                      `Sur tes ${report.lobby.games} derniers matchs, tes alliés étaient en moyenne ${tierGap(report.lobby.allies)} et tes adversaires ${tierGap(report.lobby.enemies)}. Les joueurs de la prochaine game ne sont connus qu'une fois la partie trouvée.`,
                      `Over your last ${report.lobby.games} matches, your teammates were on average ${tierGap(report.lobby.allies)} and your opponents ${tierGap(report.lobby.enemies)}. The next game's players are only known once the match is found.`,
                    )
                  : t("Les joueurs de la prochaine game ne sont connus qu'une fois la partie trouvée.", "The next game's players are only known once the match is found.")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
