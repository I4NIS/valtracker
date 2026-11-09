import "../styles/whatsnew.css";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Release } from "../lib/changelog";
import { formatDate } from "../lib/format";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import type { Page } from "./Shell";

const RELEASE_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

type Props = {
  releases: Release[];
  installed: string | null;
  onNavigate: (page: Page) => void;
  onClose: () => void;
};

export function WhatsNew({ releases, installed, onNavigate, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = (page: Page) => {
    onClose();
    onNavigate(page);
  };

  return createPortal(
    <div className="whatsnew-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="whatsnew-dialog" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title" tabIndex={-1} ref={dialogRef}>
        <header className="whatsnew-head">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="whatsnew-title" className="whatsnew-title">
              {installed ? t(`Valtracker ${installed} est installé`, `Valtracker ${installed} is installed`) : t("Nouveautés", "What's new")}
            </h2>
            <span className="faint">
              {installed ? t("Voici ce qui a changé depuis ta dernière version.", "Here is what changed since your last version.") : t("Toutes les versions de Valtracker.", "Every Valtracker version.")}
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Fermer", "Close")}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="whatsnew-body">
          {releases.map((release) => (
            <section className="whatsnew-release" key={release.version}>
              <div className="whatsnew-release-head">
                <strong>{t(`Version ${release.version}`, `Version ${release.version}`)}</strong>
                <span className="faint">{formatDate(new Date(`${release.date}T12:00:00`), RELEASE_DATE)}</span>
              </div>
              <ul className="whatsnew-list">
                {release.changes.map((change) => (
                  <li className="whatsnew-change" key={change.title}>
                    <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                      <strong>{change.title}</strong>
                      <span className="muted">{change.text}</span>
                      {change.howTo && <span className="faint whatsnew-howto">{change.howTo}</span>}
                    </div>
                    {change.page && (
                      <button type="button" className="btn btn-secondary whatsnew-go" onClick={() => open(change.page as Page)}>
                        {t("Voir", "Show")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="whatsnew-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t("C'est noté", "Got it")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
