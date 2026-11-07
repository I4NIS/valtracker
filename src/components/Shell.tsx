import type { ReactNode } from "react";
import type { Account, Theme } from "../lib/api";
import { timeAgo } from "../lib/format";
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

export type SyncView = {
  running: boolean;
  stage: string;
  newMatches: number;
  error: string | null;
  lastSyncAt: string | null;
};

const NAV: { title: string; items: { page: Page; label: string; icon: IconName }[] }[] = [
  {
    title: "Général",
    items: [
      { page: "home", label: "Accueil", icon: "home" },
      { page: "matches", label: "Matchs", icon: "matches" },
      { page: "progress", label: "Progression", icon: "progress" },
    ],
  },
  {
    title: "Analyse",
    items: [
      { page: "agents", label: "Agents", icon: "agents" },
      { page: "maps", label: "Maps", icon: "maps" },
      { page: "weapons", label: "Armes", icon: "weapons" },
      { page: "duels", label: "Duels", icon: "duels" },
      { page: "heatmaps", label: "Heatmaps", icon: "heatmaps" },
    ],
  },
  {
    title: "Perso",
    items: [{ page: "journal", label: "Journal", icon: "journal" }],
  },
];

type Props = {
  page: Page;
  onNavigate: (page: Page) => void;
  account: Account | null;
  theme: Theme;
  onToggleTheme: () => void;
  sync: SyncView;
  onSync: () => void;
  tourTarget: TourTarget | null;
  children: ReactNode;
};

function syncText(sync: SyncView): string {
  if (sync.running) {
    const extra = sync.newMatches > 0 ? `, ${sync.newMatches} nouveaux` : "";
    return `Synchronisation : ${sync.stage}${extra}`;
  }
  if (sync.error) return `Échec de la synchro : ${sync.error}`;
  return `Synchronisé ${timeAgo(sync.lastSyncAt)}`;
}

export function Shell({ page, onNavigate, account, theme, onToggleTheme, sync, onSync, tourTarget, children }: Props) {
  const target = (id: TourTarget) => (tourTarget === id ? " tour-target" : "");

  return (
    <div className="window">
      <TitleBar />
      <div className="app">
        <nav className="sidebar" aria-label="Navigation principale">
          {NAV.map((group) => (
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
            aria-label="Paramètres et comptes"
          >
            <RankBadge tier={account?.tier} size={36} />
            <span className="names">
              <strong>{account?.name ?? "Aucun compte"}</strong>
              <span className="faint">{account ? `#${account.tag}` : "Ajoute un compte"}</span>
            </span>
            <Icon name="settings" />
          </button>
        </nav>
  
        <main className="main">
          <div className="topbar">
            <span className={`sync-status${sync.error && !sync.running ? " error" : ""}`} role="status">
              <span className={`dot${sync.running ? " running" : ""}`} />
              {syncText(sync)}
            </span>
            <button
              type="button"
              className={`icon-btn${target("sync")}`}
              onClick={onSync}
              disabled={sync.running || !account}
              aria-label="Synchroniser maintenant"
              title="Synchroniser maintenant"
            >
              <Icon name="sync" size={16} strokeWidth={2} className={sync.running ? "spin" : undefined} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
              title={theme === "dark" ? "Thème clair" : "Thème sombre"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} strokeWidth={2} />
            </button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
