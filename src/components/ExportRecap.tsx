import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, errorMessage, type Account } from "../lib/api";
import { t } from "../lib/i18n";
import { recapApi } from "../lib/recap";
import { toBlob } from "../recap/draw";
import { Icon } from "./Icon";
import "../styles/recap.css";

type Common = { account: Account; label?: string; className?: string };

type Props =
  | (Common & { kind: "match"; matchId: string })
  | (Common & { kind: "session" })
  | (Common & { kind: "act"; season: string | null });

type Toast = { ok: boolean; message: string; path: string | null };

const TOAST_MS = 7000;

function stamp(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

async function render(props: Props): Promise<{ canvas: HTMLCanvasElement; name: string }> {
  const { account } = props;
  if (props.kind === "match") {
    const [detail, { renderMatchRecap }] = await Promise.all([api.getMatch(account.puuid, props.matchId), import("../recap/match")]);
    return { canvas: await renderMatchRecap(detail, account), name: `valtracker-match-${stamp(detail.startedAt)}` };
  }
  if (props.kind === "session") {
    const [recap, { renderSessionRecap }] = await Promise.all([recapApi.getSessionRecap(account.puuid), import("../recap/session")]);
    return { canvas: await renderSessionRecap(recap, account), name: `valtracker-session-${stamp(recap.startedAt)}` };
  }
  const [recap, { renderActRecap }] = await Promise.all([recapApi.getActRecap(account.puuid, props.season), import("../recap/act")]);
  return { canvas: await renderActRecap(recap, account), name: t(`valtracker-acte-${recap.season ?? "global"}`, `valtracker-act-${recap.season ?? "global"}`) };
}

export function ExportRecapButton(props: Props) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function exportImage() {
    if (busy) return;
    setBusy(true);
    setToast(null);
    try {
      const { canvas, name } = await render(props);
      const saved = await recapApi.saveImage(`${name}.png`, await toBlob(canvas));
      const message = saved.copied
        ? t("Image copiée et enregistrée", "Image copied and saved")
        : t("Image enregistrée, la copie a échoué", "Image saved, copy failed");
      setToast({ ok: true, message, path: saved.path });
    } catch (error) {
      setToast({ ok: false, message: errorMessage(error), path: null });
    } finally {
      setBusy(false);
    }
  }

  async function reveal(path: string) {
    try {
      await recapApi.reveal(path);
    } catch (error) {
      setToast({ ok: false, message: errorMessage(error), path: null });
    }
  }

  return (
    <>
      <button
        type="button"
        className={props.className ? `btn btn-secondary ${props.className}` : "btn btn-secondary"}
        onClick={exportImage}
        disabled={busy}
        aria-busy={busy}
      >
        <Icon name={busy ? "running" : "image"} size={16} className={busy ? "spin" : undefined} />
        {busy ? t("Export en cours", "Exporting") : (props.label ?? t("Exporter l'image", "Export image"))}
      </button>
      {toast &&
        createPortal(
          <div className={toast.ok ? "recap-toast" : "recap-toast error"} role="status">
            <span className="recap-toast-icon">
              <Icon name={toast.ok ? "check" : "close"} size={15} strokeWidth={2.4} />
            </span>
            <span className="recap-toast-text">{toast.message}</span>
            {toast.path && (
              <button type="button" className="btn btn-secondary recap-toast-action" onClick={() => reveal(toast.path as string)}>
                {t("Ouvrir le dossier", "Open folder")}
              </button>
            )}
            <button type="button" className="recap-toast-close" aria-label={t("Fermer", "Close")} onClick={() => setToast(null)}>
              <Icon name="close" size={15} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
