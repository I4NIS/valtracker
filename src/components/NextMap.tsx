import "../styles/nextgame.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Account } from "../lib/api";
import { fmt, pct } from "../lib/format";
import { mapArt } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { mapOdds } from "../lib/mapOdds";
import { getNextGame } from "../lib/nextGame";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { Art } from "./GameArt";
import { Icon } from "./Icon";

const rounded = (value: number) => Math.round(value * 100);

export function NextMapButton({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({ key: `nextGame|${account.puuid}`, fetch: () => getNextGame(account.puuid) }).data ?? null;
  const rotation = useQuery(queries.rotation(account.region)).data ?? null;
  const odds = useMemo(() => (history ? mapOdds(history, rotation, null) : null), [history, rotation]);
  if (!odds) return null;
  const best = odds.maps[0];
  const tied = odds.maps.filter((map) => rounded(map.chance) === rounded(best.chance)).length;
  return (
    <>
      <button type="button" className="btn btn-secondary nextgame-button" onClick={() => setOpen(true)} title={t("Chance de chaque map de tomber à ta prochaine game", "Chance of each map coming up in your next game")}>
        {t("Prochaine map", "Next map")}
        <span className="nextgame-badge">
          {tied > 1 ? t(`${tied} maps à ${pct(best.chance * 100, 0)}`, `${tied} maps at ${pct(best.chance * 100, 0)}`) : `${best.name} ${pct(best.chance * 100, 0)}`}
        </span>
      </button>
      {open && <NextMapDialog odds={odds} onClose={() => setOpen(false)} />}
    </>
  );
}

function NextMapDialog({ odds, onClose }: { odds: NonNullable<ReturnType<typeof mapOdds>>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const top = Math.max(...odds.maps.map((map) => map.chance));
  const [last, previous] = odds.repeats;

  return createPortal(
    <div className="nextgame-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="nextgame-dialog nextmap-dialog" role="dialog" aria-modal="true" aria-labelledby="nextmap-title" tabIndex={-1} ref={dialogRef}>
        <header className="nextgame-head">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="nextmap-title" className="nextgame-title">
              {t("Prochaine map", "Next map")}
            </h2>
            <span className="faint">
              {t(`Chance de chaque map en rotation de tomber à ta prochaine game, d'après tes ${fmt(odds.repeats[0]?.samples ?? 0)} derniers matchs.`, `Chance of each map in rotation coming up in your next game, from your last ${fmt(odds.repeats[0]?.samples ?? 0)} matches.`)}
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Fermer", "Close")}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="nextgame-body">
          <ul className="nextmap-list">
            {odds.maps.map((map) => (
              <li className="nextmap-row" key={map.id}>
                <Art src={mapArt(map.id, "listviewicon")} width={96} height={32} alt="" className="nextmap-thumb" />
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <strong className="ellipsis">{map.name}</strong>
                  <span className="faint">
                    {map.lastSeen === null
                      ? t("Jamais jouée ici", "Never played here")
                      : map.lastSeen === 1
                        ? t("Ta dernière game", "Your last game")
                        : t(`Jouée il y a ${map.lastSeen} games`, `Played ${map.lastSeen} games ago`)}
                  </span>
                </span>
                <span className="nextmap-bar" aria-hidden="true">
                  <span style={{ width: `${(map.chance / top) * 100}%` }} />
                </span>
                <strong className="nextmap-value">{pct(map.chance * 100, 0)}</strong>
              </li>
            ))}
          </ul>
          <p className="faint nextgame-note">
            {last && previous
              ? t(
                  `Valorant tire la map parmi les maps en rotation. Sur tes matchs, la map de la game précédente est retombée ${pct(last.observed * 100, 0)} du temps et celle d'il y a deux games ${pct(previous.observed * 100, 0)}, contre ${pct(last.expected * 100, 0)} au hasard. Les autres maps se partagent le reste.`,
                  `Valorant draws the map among the maps in rotation. In your matches, the previous game's map came back ${pct(last.observed * 100, 0)} of the time and the one from two games ago ${pct(previous.observed * 100, 0)}, against ${pct(last.expected * 100, 0)} at random. The other maps share the rest.`,
                )
              : ""}
          </p>
          {odds.backtest && (
            <p className="faint nextgame-note">
              {t(
                `Rejoué sur tes ${odds.backtest.tests} derniers matchs : la map qui est tombée avait en moyenne ${pct(odds.backtest.given * 100, 1)} avec ce calcul, contre ${pct(odds.backtest.random * 100, 1)} au hasard.`,
                `Replayed over your last ${odds.backtest.tests} matches: the map that came up had ${pct(odds.backtest.given * 100, 1)} on average with this calculation, against ${pct(odds.backtest.random * 100, 1)} at random.`,
              )}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
