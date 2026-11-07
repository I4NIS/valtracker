import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../lib/i18n";
import { Logo } from "./Logo";

const appWindow = getCurrentWindow();

function Control({ label, path, onClick, danger }: { label: string; path: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`window-control${danger ? " danger" : ""}`} onClick={onClick} aria-label={label} title={label}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
}

export function TitleBar() {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <Logo size={20} />
        <span data-tauri-drag-region>Valtracker</span>
      </div>
      <div className="window-controls">
        <Control label={t("Réduire", "Minimize")} path="M2 6h8" onClick={() => appWindow.minimize()} />
        <Control label={t("Agrandir", "Maximize")} path="M2.5 2.5h7v7h-7z" onClick={() => appWindow.toggleMaximize()} />
        <Control label={t("Fermer", "Close")} path="M2.5 2.5l7 7M9.5 2.5l-7 7" onClick={() => appWindow.close()} danger />
      </div>
    </header>
  );
}
