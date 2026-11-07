import "../styles/palette.css";
import { useState, type ReactNode } from "react";
import type { Account, Theme } from "../lib/api";
import { timeAgo } from "../lib/format";
import { t } from "../lib/i18n";
import { useSync, useSyncRunning, type SyncView } from "../lib/sync";
import { ExportDialog } from "./ExportRecap";
import { Icon, type IconName } from "./Icon";
import { RankBadge } from "./RankBadge";
import { TitleBar } from "./TitleBar";

export type Page =
  | "home"
  | "matches"
  | "progress"
  | "agents"
  | "maps"
  | "weapons"
  | "duels"
  | "heatmaps"
  | "journal"
  | "settings";

export type TourTarget = Page | "sync";

export type { SyncView };

const NAV = (): { title: string; items: { page: Page; label: string; icon: IconName }[] }[] => [
  {
    title: t("Général", "General"),
    items: [
      { page: "home", label: t("Accueil", "Home"), icon: "home" },
      { page: "matches", label: t("Matchs", "Matches"), icon: "matches" },
      { page: "progress", label: t("Progression", "Progression"), icon: "progress" },
    ],
  },
  {
    title: t("Analyse", "Analysis"),
    items: [
      { page: "agents", label: t("Agents", "Agents"), icon: "agents" },
      { page: "maps", label: t("Maps", "Maps"), icon: "maps" },
      { page: "weapons", label: t("Armes", "Weapons"), icon: "weapons" },
      { page: "duels", label: t("Duels", "Duels"), icon: "duels" },
      { page: "heatmaps", label: t("Heatmaps", "Heatmaps"), icon: "heatmaps" },
    ],
  },
  {
    title: t("Perso", "Personal"),
    items: [{ page: "journal", label: t("Journal", "Journal"), icon: "journal" }],
  },
];

type Props = {
  page: Page;
  onNavigate: (page: Page) => void;
  account: Account | null;
  combinedCount?: number;
  theme: Theme;
  onToggleTheme: () => void;
  onSync: () => void;
  tourTarget: TourTarget | null;
  onSearch?: () => void;
  children: ReactNode;
};

function syncText(sync: SyncView): string {
  if (sync.running) {
    const extra = sync.newMatches > 0 ? t(`, ${sync.newMatches} nouveaux`, `, ${sync.newMatches} new`) : "";
    return t(`Synchronisation : ${sync.stage}${extra}`, `Syncing: ${sync.stage}${extra}`);
  }
  if (sync.error) return t(`Échec de la synchro : ${sync.error}`, `Sync failed: ${sync.error}`);
  return t(`Synchronisé ${timeAgo(sync.lastSyncAt)}`, sync.lastSyncAt ? `Synced ${timeAgo(sync.lastSyncAt)}` : "Never synced");
}

export function Shell({
  page,
  onNavigate,
  account,
  combinedCount = 0,
  theme,
  onToggleTheme,
  onSync,
  tourTarget,
  onSearch,
  children,
}: Props) {
  const target = (id: TourTarget) => (tourTarget === id ? " tour-target" : "");
  const [exporting, setExporting] = useState(false);

  return (
    <div className="window">
      <TitleBar />
      <div className="app">
        <nav className="sidebar" aria-label={t("Navigation principale", "Main navigation")}>
          {NAV().map((group) => (
            <div className="nav-group" key={group.title}>
              <span className="nav-group-title">{group.title}</span>
              {group.items.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  className={`nav-item${page === item.page ? " active" : ""}${target(item.page)}`}
                  aria-current={page === item.page ? "page" : undefined}
                  title={item.label}
                  onClick={() => onNavigate(item.page)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            className={`account-chip${target("settings")}`}
            onClick={() => onNavigate("settings")}
            aria-label={t("Paramètres et comptes", "Settings and accounts")}
          >
            <RankBadge tier={account?.tier} size={36} />
            <span className="names">
              <strong>{combinedCount > 1 ? t("Tous les comptes", "All accounts") : (account?.name ?? t("Aucun compte", "No account"))}</strong>
              <span className="faint">
                {combinedCount > 1
                  ? t(`${combinedCount} comptes`, `${combinedCount} accounts`)
                  : account
                    ? `#${account.tag}`
                    : t("Ajoute un compte", "Add an account")}
              </span>
            </span>
            <Icon name="settings" />
          </button>
        </nav>
  
        <main className="main">
          <div className="topbar">
            {onSearch && (
              <button
                type="button"
                className="search-pill"
                onClick={onSearch}
                aria-label={t("Rechercher", "Search")}
                aria-keyshortcuts="Control+K"
                title={t("Rechercher (Ctrl K)", "Search (Ctrl K)")}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-4-4" />
                </svg>
                <span>{t("Rechercher", "Search")}</span>
                <kbd>Ctrl K</kbd>
              </button>
            )}
            <SyncStatus />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setExporting(true)}
              disabled={!account}
              aria-haspopup="dialog"
              aria-label={t("Exporter une image", "Export an image")}
              title={t("Exporter une image", "Export an image")}
            >
              <Icon name="image" size={16} strokeWidth={2} />
            </button>
            <SyncButton className={`icon-btn${target("sync")}`} onSync={onSync} disabled={!account} />
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? t("Passer en thème clair", "Switch to light theme") : t("Passer en thème sombre", "Switch to dark theme")}
              title={theme === "dark" ? t("Thème clair", "Light theme") : t("Thème sombre", "Dark theme")}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} strokeWidth={2} />
            </button>
          </div>
          {children}
        </main>
      </div>
      {exporting && account && <ExportDialog account={account} onClose={() => setExporting(false)} />}
    </div>
  );
}

function SyncStatus() {
  const sync = useSync();
  return (
    <span className={`sync-status${sync.error && !sync.running ? " error" : ""}`} role="status">
      <span className={`dot${sync.running ? " running" : ""}`} />
      {syncText(sync)}
    </span>
  );
}

function SyncButton({ className, onSync, disabled }: { className: string; onSync: () => void; disabled: boolean }) {
  const running = useSyncRunning();
  return (
    <button
      type="button"
      className={className}
      onClick={onSync}
      disabled={running || disabled}
      aria-label={t("Synchroniser maintenant", "Sync now")}
      title={t("Synchroniser maintenant", "Sync now")}
    >
      <Icon name="sync" size={16} strokeWidth={2} className={running ? "spin" : undefined} />
    </button>
  );
}
