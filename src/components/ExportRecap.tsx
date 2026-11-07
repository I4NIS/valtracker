import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, errorMessage, type Account } from "../lib/api";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, fullDate } from "../lib/format";
import { mapArt } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { recapApi, type RecapMatch } from "../lib/recap";
import { toBlob } from "../recap/draw";
import { Art } from "./GameArt";
import { Icon } from "./Icon";
import "../styles/recap.css";

export type ExportMode = "match" | "matches" | "range" | "act" | "session";

export type ExportPreset = { mode: ExportMode; matchId?: string | null; season?: string | null };

type Common = { account: Account; label?: string; className?: string };

type Props =
  | (Common & { kind: "match"; matchId: string })
  | (Common & { kind: "session" })
  | (Common & { kind: "act"; season: string | null });

type Choice =
  | { mode: "match"; matchId: string | null }
  | { mode: "matches"; matchIds: string[] }
  | { mode: "range"; from: string; to: string }
  | { mode: "act"; season: string | null }
  | { mode: "session" };

type Preview = { url: string; blob: Blob; name: string };

type Status = { step: "copied" } | { step: "saved"; path: string } | { step: "error"; message: string };

const PAGE = 30;
const DEBOUNCE_MS = 220;

const MODES = (): { mode: ExportMode; label: string }[] => [
  { mode: "match", label: t("Un match", "One match") },
  { mode: "matches", label: t("Plusieurs matchs", "Several matches") },
  { mode: "range", label: t("Période", "Date range") },
  { mode: "act", label: t("Acte", "Act") },
  { mode: "session", label: t("Dernière session", "Last session") },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function stamp(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function dayInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dayInput(date);
}

function localDay(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function bounds(from: string, to: string): { start: Date; end: Date } | null {
  const start = localDay(from);
  const last = localDay(to);
  if (!start || !last || start > last) return null;
  const end = new Date(last);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function blocker(choice: Choice): string | null {
  if (choice.mode === "match" && !choice.matchId) return t("Choisis une partie.", "Pick a match.");
  if (choice.mode === "matches" && choice.matchIds.length === 0) return t("Choisis au moins une partie.", "Pick at least one match.");
  if (choice.mode === "range" && !bounds(choice.from, choice.to)) return t("La date de début doit précéder la date de fin.", "The start date must come before the end date.");
  return null;
}

async function render(account: Account, choice: Choice): Promise<{ canvas: HTMLCanvasElement; name: string }> {
  const { puuid } = account;
  if (choice.mode === "match") {
    const [detail, { renderMatchRecap }] = await Promise.all([api.getMatch(puuid, choice.matchId ?? ""), import("../recap/match")]);
    return { canvas: await renderMatchRecap(detail, account), name: `valtracker-match-${stamp(detail.startedAt)}` };
  }
  if (choice.mode === "matches") {
    const [recap, { renderSelectionRecap }] = await Promise.all([recapApi.getSelectionRecap(puuid, choice.matchIds), import("../recap/selection")]);
    return { canvas: await renderSelectionRecap(recap, account, { kind: "matches" }), name: `valtracker-selection-${stamp(recap.startedAt)}` };
  }
  if (choice.mode === "range") {
    const range = bounds(choice.from, choice.to);
    if (!range) throw new Error(t("Période invalide", "Invalid date range"));
    const last = new Date(range.end);
    last.setDate(last.getDate() - 1);
    const [recap, { renderSelectionRecap }] = await Promise.all([
      recapApi.getRangeRecap(puuid, Math.floor(range.start.getTime() / 1000), Math.floor(range.end.getTime() / 1000)),
      import("../recap/selection"),
    ]);
    const canvas = await renderSelectionRecap(recap, account, { kind: "range", first: range.start.toISOString(), last: last.toISOString() });
    return { canvas, name: t(`valtracker-periode-${choice.from}-${choice.to}`, `valtracker-range-${choice.from}-${choice.to}`) };
  }
  if (choice.mode === "session") {
    const [recap, { renderSessionRecap }] = await Promise.all([recapApi.getSessionRecap(puuid), import("../recap/session")]);
    return { canvas: await renderSessionRecap(recap, account), name: `valtracker-session-${stamp(recap.startedAt)}` };
  }
  const [recap, { renderActRecap }] = await Promise.all([recapApi.getActRecap(puuid, choice.season), import("../recap/act")]);
  return { canvas: await renderActRecap(recap, account), name: t(`valtracker-acte-${recap.season ?? "global"}`, `valtracker-act-${recap.season ?? "global"}`) };
}

export function ExportRecapButton(props: Props) {
  const [open, setOpen] = useState(false);
  const preset: ExportPreset =
    props.kind === "match"
      ? { mode: "match", matchId: props.matchId }
      : props.kind === "act"
        ? { mode: "act", season: props.season }
        : { mode: "session" };

  return (
    <>
      <button
        type="button"
        className={props.className ? `btn btn-secondary ${props.className}` : "btn btn-secondary"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Icon name="image" size={16} />
        {props.label ?? t("Exporter l'image", "Export image")}
      </button>
      {open && <ExportDialog account={props.account} preset={preset} onClose={() => setOpen(false)} />}
    </>
  );
}

function MatchRow({ game, checked, multiple, onToggle }: { game: RecapMatch; checked: boolean; multiple: boolean; onToggle: () => void }) {
  const tone = game.won ? "is-win" : game.draw ? "is-draw" : "is-loss";
  return (
    <li>
      <button type="button" role={multiple ? "checkbox" : "radio"} aria-checked={checked} className={`export-match${checked ? " checked" : ""}`} onClick={onToggle}>
        <span className={`export-check${multiple ? "" : " round"}`} aria-hidden="true">
          {checked && <Icon name="check" size={12} strokeWidth={3} />}
        </span>
        <span className="export-match-art">
          <Art src={mapArt(game.mapId, "listviewicon")} width={72} height={34} alt="" className="export-match-map" />
          <Art src={agentIcon(game.agentId)} width={24} height={24} alt="" className="export-match-agent" />
        </span>
        <span className="export-match-main">
          <strong className="ellipsis">{game.mapName ?? t("Map inconnue", "Unknown map")}</strong>
          <span className="faint ellipsis">{fullDate(game.startedAt)}</span>
        </span>
        <span className="export-match-side">
          <strong className={tone}>{`${game.roundsWon} - ${game.roundsLost}`}</strong>
          <span className="faint">{`${game.kills} / ${game.deaths} / ${game.assists}`}</span>
        </span>
      </button>
    </li>
  );
}

export function ExportDialog({ account, preset, onClose }: { account: Account; preset?: ExportPreset; onClose: () => void }) {
  const { puuid } = account;
  const [mode, setMode] = useState<ExportMode>(preset?.mode ?? "match");
  const [matchId, setMatchId] = useState<string | null>(preset?.matchId ?? null);
  const [matchIds, setMatchIds] = useState<string[]>(preset?.matchId ? [preset.matchId] : []);
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => daysAgo(0));
  const [season, setSeason] = useState<string | null | undefined>(preset?.mode === "act" ? preset.season : undefined);
  const [shown, setShown] = useState(PAGE);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rendering, setRendering] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);

  const matchesQuery = useQuery({ key: `recapMatches|${puuid}`, fetch: () => recapApi.getRecapMatches(puuid) });
  const seasonsQuery = useQuery(queries.seasons(puuid));
  const matches = matchesQuery.data ?? null;
  const seasons = seasonsQuery.data ?? [];
  const firstMatch = matches?.[0]?.matchId ?? null;
  const currentSeason = seasons[0]?.short ?? null;

  const choice = useMemo<Choice>(() => {
    if (mode === "match") return { mode, matchId: matchId ?? firstMatch };
    if (mode === "matches") return { mode, matchIds };
    if (mode === "range") return { mode, from, to };
    if (mode === "act") return { mode, season: season ?? currentSeason };
    return { mode };
  }, [mode, matchId, firstMatch, matchIds, from, to, season, currentSeason]);
  const choiceKey = JSON.stringify(choice);
  const blocked = blocker(choice);

  const inRange = useMemo(() => {
    const range = bounds(from, to);
    if (!range || !matches) return null;
    return matches.filter((game) => {
      const time = new Date(game.startedAt).getTime();
      return time >= range.start.getTime() && time < range.end.getTime();
    }).length;
  }, [matches, from, to]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const id = ++run.current;
    setStatus(null);
    setFailure(null);
    if (blocked) {
      setRendering(false);
      setPreview(null);
      return;
    }
    setRendering(true);
    const timer = window.setTimeout(async () => {
      try {
        const { canvas, name } = await render(account, choice);
        const blob = await toBlob(canvas);
        if (id !== run.current) return;
        setPreview({ url: URL.createObjectURL(blob), blob, name });
      } catch (error) {
        if (id !== run.current) return;
        setPreview(null);
        setFailure(errorMessage(error));
      } finally {
        if (id === run.current) setRendering(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [choiceKey, account.puuid]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  function toggle(id: string) {
    setMatchIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function act(task: () => Promise<Status>) {
    if (busy) return;
    setBusy(true);
    try {
      setStatus(await task());
    } catch (error) {
      setStatus({ step: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!preview) return;
    const image = preview;
    act(async () => {
      await recapApi.copyImage(image.blob);
      return { step: "copied" };
    });
  }

  function download() {
    if (!preview) return;
    const image = preview;
    act(async () => ({ step: "saved", path: await recapApi.saveImage(`${image.name}.png`, image.blob) }));
  }

  function reveal(path: string) {
    act(async () => {
      await recapApi.reveal(path);
      return { step: "saved", path };
    });
  }

  const multiple = mode === "matches";
  const selectedMatch = choice.mode === "match" ? choice.matchId : null;
  const activeSeason = choice.mode === "act" ? choice.season : null;

  return createPortal(
    <div className="export-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" tabIndex={-1} ref={dialogRef}>
        <header className="export-head">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="export-title" className="export-title">
              {t("Exporter une image", "Export an image")}
            </h2>
            <span className="faint">{t("Récap en 1600x900, prêt à partager.", "1600x900 recap, ready to share.")}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Fermer", "Close")}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="export-modes">
          <div className="segmented" role="tablist" aria-label={t("Contenu de l'image", "Image content")}>
            {MODES().map((item) => (
              <button
                key={item.mode}
                type="button"
                role="tab"
                aria-selected={mode === item.mode}
                className={mode === item.mode ? "active" : undefined}
                onClick={() => {
                  setMode(item.mode);
                  setShown(PAGE);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="export-body">
          <div className="export-controls">
            {(mode === "match" || mode === "matches") && (
              <>
                <div className="row between" style={{ alignItems: "baseline" }}>
                  <span className="label">{multiple ? t("Parties à inclure", "Matches to include") : t("Partie", "Match")}</span>
                  {multiple && matchIds.length > 0 && (
                    <button type="button" className="export-link" onClick={() => setMatchIds([])}>
                      {t(`Retirer les ${fmt(matchIds.length)}`, `Clear ${fmt(matchIds.length)}`)}
                    </button>
                  )}
                </div>
                {matchesQuery.error && !matches ? (
                  <span className="form-error">{matchesQuery.error}</span>
                ) : !matches ? (
                  <span className="faint">{t("Chargement de tes parties...", "Loading your matches...")}</span>
                ) : matches.length === 0 ? (
                  <span className="faint">{t("Aucune partie compétitive synchronisée.", "No competitive match synced.")}</span>
                ) : (
                  <ul className="export-list" role={multiple ? "group" : "radiogroup"} aria-label={t("Tes parties compétitives", "Your competitive matches")}>
                    {matches.slice(0, shown).map((game) => (
                      <MatchRow
                        key={game.matchId}
                        game={game}
                        multiple={multiple}
                        checked={multiple ? matchIds.includes(game.matchId) : selectedMatch === game.matchId}
                        onToggle={() => (multiple ? toggle(game.matchId) : setMatchId(game.matchId))}
                      />
                    ))}
                    {matches.length > shown && (
                      <li>
                        <button type="button" className="btn btn-secondary export-more" onClick={() => setShown(shown + PAGE)}>
                          {t("Afficher plus", "Show more")}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </>
            )}

            {mode === "range" && (
              <>
                <div className="export-dates">
                  <label className="field">
                    <span className="label">{t("Du", "From")}</span>
                    <input className="input" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
                  </label>
                  <label className="field">
                    <span className="label">{t("Au", "To")}</span>
                    <input className="input" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
                  </label>
                </div>
                <div className="chips" role="group" aria-label={t("Raccourcis", "Shortcuts")}>
                  {[
                    { days: 6, label: t("7 derniers jours", "Last 7 days") },
                    { days: 29, label: t("30 derniers jours", "Last 30 days") },
                  ].map((item) => {
                    const active = from === daysAgo(item.days) && to === daysAgo(0);
                    return (
                      <button
                        key={item.days}
                        type="button"
                        className={`chip${active ? " active" : ""}`}
                        onClick={() => {
                          setFrom(daysAgo(item.days));
                          setTo(daysAgo(0));
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {inRange !== null && (
                  <span className="faint">
                    {inRange === 0
                      ? t("Aucune partie sur cette période.", "No match in this range.")
                      : t(`${fmt(inRange)} ${inRange > 1 ? "parties" : "partie"} sur cette période.`, `${fmt(inRange)} ${inRange === 1 ? "match" : "matches"} in this range.`)}
                  </span>
                )}
              </>
            )}

            {mode === "act" && (
              <>
                <span className="label">{t("Acte", "Act")}</span>
                {seasons.length === 0 ? (
                  <span className="faint">{t("Aucun acte synchronisé.", "No Act synced.")}</span>
                ) : (
                  <div className="chips" role="group" aria-label={t("Acte", "Act")}>
                    {seasons.map((item) => (
                      <button key={item.short} type="button" className={`chip${activeSeason === item.short ? " active" : ""}`} onClick={() => setSeason(item.short)}>
                        {seasonLabel(item.short)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {mode === "session" && (
              <p className="hint" style={{ margin: 0 }}>
                {t(
                  "Ta dernière session regroupe tes parties compétitives les plus récentes, enchaînées sans pause de plus d'une heure.",
                  "Your last session groups your most recent competitive matches, played with no break longer than an hour.",
                )}
              </p>
            )}
          </div>

          <div className="export-preview">
            <div className={`export-frame${rendering ? " is-loading" : ""}`}>
              {preview && <img src={preview.url} alt={t("Aperçu de l'image", "Image preview")} />}
              {!preview && !rendering && <span className="export-frame-note">{blocked ?? failure ?? ""}</span>}
              {rendering && (
                <span className="export-frame-wait" role="status">
                  <Icon name="running" size={16} className="spin" />
                  {t("Préparation de l'aperçu", "Preparing preview")}
                </span>
              )}
            </div>
            {preview && failure === null && blocked === null && !rendering && (
              <span className="faint export-size">{t("Aperçu réduit, l'image fait 1600x900.", "Scaled preview, the image is 1600x900.")}</span>
            )}
          </div>
        </div>

        <footer className="export-foot">
          <div className="export-status" role="status">
            {status && (
              <>
                <span className={`export-status-icon${status.step === "error" ? " is-error" : ""}`}>
                  <Icon name={status.step === "error" ? "close" : "check"} size={14} strokeWidth={2.4} />
                </span>
                <span className="export-status-text">
                  {status.step === "copied"
                    ? t("Image copiée", "Image copied")
                    : status.step === "saved"
                      ? t("Image enregistrée dans Téléchargements", "Image saved to Downloads")
                      : status.message}
                </span>
              </>
            )}
          </div>
          <div className="export-foot-actions">
            {status?.step === "copied" && (
              <button type="button" className="btn btn-secondary" onClick={download} disabled={busy}>
                <Icon name="download" size={16} strokeWidth={2} />
                {t("Télécharger", "Download")}
              </button>
            )}
            {status?.step === "saved" && (
              <button type="button" className="btn btn-secondary" onClick={() => reveal(status.path)} disabled={busy}>
                <Icon name="folder" size={16} strokeWidth={2} />
                {t("Afficher dans le dossier", "Show in folder")}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={copy} disabled={!preview || rendering || busy} aria-busy={busy}>
              <Icon name={busy ? "running" : "copy"} size={16} strokeWidth={2} className={busy ? "spin" : undefined} />
              {t("Copier l'image", "Copy image")}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
