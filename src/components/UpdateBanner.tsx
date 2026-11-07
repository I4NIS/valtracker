import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";
import { errorMessage } from "../lib/api";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";

type Stage = "idle" | "downloading" | "installing" | "error";

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    check()
      .then((found) => setUpdate(found))
      .catch(() => setUpdate(null));
  }, []);

  if (!update || dismissed) return null;

  const install = async () => {
    setStage("downloading");
    setError(null);
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((received / total) * 100));
        }
        if (event.event === "Finished") setStage("installing");
      });
      await relaunch();
    } catch (err) {
      setStage("error");
      setError(errorMessage(err));
    }
  };

  const busy = stage === "downloading" || stage === "installing";

  return (
    <div className="update-banner" role="status">
      <span className="tour-icon">
        <Icon name="sync" size={16} strokeWidth={2} className={busy ? "spin" : undefined} />
      </span>
      <div className="stack" style={{ gap: 2, flexGrow: 1 }}>
        <strong>{t(`Valtracker ${update.version} est disponible`, `Valtracker ${update.version} is available`)}</strong>
        <span className="hint">
          {stage === "downloading" && t(`Téléchargement ${progress} %`, `Downloading ${progress}%`)}
          {stage === "installing" && t("Installation, l'app va redémarrer", "Installing, the app will restart")}
          {stage === "error" && t(`Échec de la mise à jour : ${error}`, `Update failed: ${error}`)}
          {stage === "idle" && t(`Tu utilises la version ${update.currentVersion}.`, `You're on version ${update.currentVersion}.`)}
        </span>
      </div>
      {!busy && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setDismissed(true)}>
            {t("Plus tard", "Later")}
          </button>
          <button type="button" className="btn btn-primary" onClick={install}>
            {stage === "error" ? t("Réessayer", "Retry") : t("Installer", "Install")}
          </button>
        </div>
      )}
    </div>
  );
}
