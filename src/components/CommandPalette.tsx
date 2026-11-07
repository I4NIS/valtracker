import "../styles/palette.css";
import { memo, useEffect, useId, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type { Account, RecentMatch, Theme } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { formatDate, timeAgo } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { useSyncRunning } from "../lib/sync";
import { Icon, type IconName } from "./Icon";
import type { Page } from "./Shell";

type Props = {
  open: boolean;
  onClose: () => void;
  account: Account | null;
  onNavigate: (page: Page) => void;
  onOpenMatch: (matchId: string) => void;
  onToggleTheme: () => void;
  onSync: () => void;
  onReplayTour: () => void;
  theme?: Theme;
};

type Item =
  | { kind: "page"; key: string; label: string; icon: IconName; haystack: string; run: () => void }
  | { kind: "action"; key: string; label: string; hint: string; icon: IconName; haystack: string; run: () => void }
  | { kind: "match"; key: string; match: RecentMatch; haystack: string; run: () => void };

type Section = { id: string; title: string; items: Item[] };

const PAGES = (): { page: Page; label: string; icon: IconName; keywords: string }[] => [
  { page: "home", label: t("Accueil", "Home"), icon: "home", keywords: t("home dashboard tableau de bord resume", "home dashboard overview summary") },
  { page: "matches", label: t("Matchs", "Matches"), icon: "matches", keywords: t("historique parties games", "history games") },
  { page: "progress", label: t("Progression", "Progression"), icon: "progress", keywords: t("rang rr elo courbe evolution", "rank rr elo chart progress") },
  { page: "agents", label: t("Agents", "Agents"), icon: "agents", keywords: t("personnages roles", "characters roles") },
  { page: "maps", label: t("Maps", "Maps"), icon: "maps", keywords: t("cartes attaque defense", "attack defense") },
  { page: "weapons", label: t("Armes", "Weapons"), icon: "weapons", keywords: t("weapons precision headshots", "guns accuracy headshots") },
  { page: "duels", label: t("Duels", "Duels"), icon: "duels", keywords: t("opening clutch matchups", "opening clutch matchups") },
  { page: "heatmaps", label: t("Heatmaps", "Heatmaps"), icon: "heatmaps", keywords: t("positions morts kills carte chaleur", "positions deaths kills map heat") },
  { page: "journal", label: t("Journal", "Journal"), icon: "journal", keywords: t("notes tags", "notes tags") },
  { page: "settings", label: t("Paramètres", "Settings"), icon: "settings", keywords: t("settings comptes cle api reglages options", "settings accounts api key preferences options") },
];

const MATCH_LIMIT = 50;

const NO_MATCHES: RecentMatch[] = [];

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function words(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function matches(haystack: string, terms: string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

function rank(label: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const name = normalize(label);
  if (name.startsWith(terms[0])) return 0;
  if (name.split(/\s+/).some((part) => part.startsWith(terms[0]))) return 1;
  return 2;
}

function dateWords(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const parts = [
    timeAgo(iso, now),
    formatDate(date, LONG_DATE),
    formatDate(date),
    `${date.getDate()}/${date.getMonth() + 1}`,
  ];
  if (date.toDateString() === now.toDateString()) parts.push(t("aujourd'hui aujourdhui", "today"));
  if (date.toDateString() === yesterday.toDateString()) parts.push(t("hier", "yesterday"));
  return parts.join(" ");
}

function matchHaystack(game: RecentMatch): string {
  return normalize(
    [
      game.mapName ?? t("map inconnue", "unknown map"),
      game.agentName ?? "",
      game.won ? t("victoire win gagne", "victory win won") : t("defaite loss perdu", "defeat loss lost"),
      `${game.roundsWon}-${game.roundsLost}`,
      `${game.kills}/${game.deaths}/${game.assists}`,
      dateWords(game.startedAt),
    ].join(" "),
  );
}

function SearchGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-4-4" />
    </svg>
  );
}

export const CommandPalette = memo(function CommandPalette(props: Props) {
  return props.open ? <PaletteDialog {...props} /> : null;
});

function PaletteDialog({ onClose, account, onNavigate, onOpenMatch, onToggleTheme, onSync, onReplayTour, theme }: Props) {
  const syncing = useSyncRunning();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onClose, onNavigate, onOpenMatch, onToggleTheme, onSync, onReplayTour });
  handlers.current = { onClose, onNavigate, onOpenMatch, onToggleTheme, onSync, onReplayTour };
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const puuid = account?.puuid ?? null;
  const hasAccount = account !== null;
  const recentQuery = useQuery(puuid ? queries.recent(puuid, MATCH_LIMIT) : null);
  const recent = (puuid ? recentQuery.data : undefined) ?? NO_MATCHES;
  const loading = puuid !== null && recentQuery.pending && recentQuery.error === null;
  const failed = puuid !== null && recentQuery.error !== null;

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      returnFocus?.focus?.();
    };
  }, []);

  const games = useMemo<Item[]>(
    () =>
      recent.map((game) => ({
        kind: "match" as const,
        key: `match-${game.matchId}`,
        match: game,
        haystack: matchHaystack(game),
        run: () => {
          handlers.current.onClose();
          handlers.current.onOpenMatch(game.matchId);
        },
      })),
    [recent],
  );

  const commands = useMemo(() => {
    const finish = (run: (target: typeof handlers.current) => void) => () => {
      handlers.current.onClose();
      run(handlers.current);
    };

    const pages: Item[] = PAGES().map((entry) => ({
      kind: "page" as const,
      key: `page-${entry.page}`,
      label: entry.label,
      icon: entry.icon,
      haystack: normalize(`${entry.label} ${entry.page} ${t("page aller", "page go")} ${entry.keywords}`),
      run: finish((target) => target.onNavigate(entry.page)),
    }));

    const actions: Item[] = [];
    if (hasAccount) {
      actions.push({
        kind: "action",
        key: "action-sync",
        label: t("Synchroniser maintenant", "Sync now"),
        hint: syncing ? t("En cours", "Running") : t("Action", "Action"),
        icon: "sync",
        haystack: normalize(
          t("Synchroniser maintenant sync synchro actualiser rafraichir mettre a jour", "Sync now synchronize refresh update reload"),
        ),
        run: finish((target) => target.onSync()),
      });
    }
    actions.push(
      {
        kind: "action",
        key: "action-theme",
        label: t("Changer de thème", "Change theme"),
        hint:
          theme === "dark"
            ? t("Passer en clair", "Switch to light")
            : theme === "light"
              ? t("Passer en sombre", "Switch to dark")
              : t("Action", "Action"),
        icon: theme === "light" ? "moon" : "sun",
        haystack: normalize(t("Changer de thème theme clair sombre dark light mode apparence", "Change theme light dark mode appearance")),
        run: finish((target) => target.onToggleTheme()),
      },
      {
        kind: "action",
        key: "action-tour",
        label: t("Revoir le tutoriel", "Replay the tour"),
        hint: t("Action", "Action"),
        icon: "arrowRight",
        haystack: normalize(t("Revoir le tutoriel tour aide guide visite decouverte", "Replay the tour tutorial help guide walkthrough")),
        run: finish((target) => target.onReplayTour()),
      },
    );
    return { pages, actions };
  }, [hasAccount, theme, syncing]);

  const sections = useMemo<Section[]>(() => {
    const terms = words(query);
    const label = (item: Item) => (item.kind === "match" ? item.match.mapName ?? "" : item.label);
    const pick = (items: Item[], sort: boolean) => {
      const kept = items.filter((item) => matches(item.haystack, terms));
      if (!sort) return kept;
      return kept
        .map((item, index) => ({ item, index, score: rank(label(item), terms) }))
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map((entry) => entry.item);
    };

    return [
      { id: "pages", title: t("Pages", "Pages"), items: pick(commands.pages, true) },
      { id: "actions", title: t("Actions", "Actions"), items: pick(commands.actions, true) },
      { id: "matches", title: t("Matchs", "Matches"), items: pick(games, false) },
    ].filter((section) => section.items.length > 0);
  }, [query, games, commands]);

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const count = flat.length;
  const current = Math.min(active, Math.max(count - 1, 0));

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [current, count]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (event.nativeEvent.isComposing || count === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current - 1 + count) % count);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      setActive(count - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      flat[current]?.run();
    }
  };

  let index = -1;

  return createPortal(
    <div className="palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("Palette de commandes", "Command palette")}
        onKeyDown={onKeyDown}
      >
        <div className="palette-search">
          <SearchGlyph />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={count > 0 ? optionId(current) : undefined}
            aria-label={t("Rechercher une page, une action ou un match", "Search for a page, an action or a match")}
            placeholder={t("Rechercher une page, une action, un match...", "Search pages, actions, matches...")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="palette-kbd">{t("Échap", "Esc")}</kbd>
        </div>

        <div className="palette-list" id={listId} role="listbox" aria-label={t("Résultats", "Results")} ref={listRef}>
          {count === 0 && (
            <div className="palette-empty" role="presentation">
              <strong>{t("Aucun résultat", "No results")}</strong>
              <span>
                {t(
                  "Essaie un nom de map, un agent, « victoire », « défaite » ou une date.",
                  "Try a map name, an agent, \"victory\", \"defeat\" or a date.",
                )}
              </span>
            </div>
          )}
          {sections.map((section) => (
            <div className="palette-section" role="group" aria-labelledby={`${baseId}-${section.id}`} key={section.id}>
              <div className="palette-section-title" id={`${baseId}-${section.id}`} role="presentation">
                <span>{section.title}</span>
                {section.id === "matches" && loading && <span className="palette-loading">{t("Chargement", "Loading")}</span>}
              </div>
              {section.items.map((item) => {
                index += 1;
                const position = index;
                const selected = position === current;
                return (
                  <div
                    key={item.key}
                    id={optionId(position)}
                    data-index={position}
                    role="option"
                    aria-selected={selected}
                    className={`palette-item${selected ? " active" : ""}`}
                    onMouseMove={() => position !== current && setActive(position)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={item.run}
                  >
                    {item.kind === "match" ? <MatchRow game={item.match} /> : <CommandRow item={item} />}
                    <kbd className="palette-enter" aria-hidden="true">
                      {t("Entrée", "Enter")}
                    </kbd>
                  </div>
                );
              })}
            </div>
          ))}
          {!loading && failed && recent.length === 0 && (
            <div className="palette-note" role="presentation">
              {t("Impossible de charger les matchs récents.", "Couldn't load recent matches.")}
            </div>
          )}
        </div>

        <div className="palette-footer" aria-hidden="true">
          <span>
            <kbd className="palette-kbd">↑</kbd>
            <kbd className="palette-kbd">↓</kbd>
            {t("naviguer", "navigate")}
          </span>
          <span>
            <kbd className="palette-kbd">{t("Entrée", "Enter")}</kbd>
            {t("ouvrir", "open")}
          </span>
          <span>
            <kbd className="palette-kbd">{t("Échap", "Esc")}</kbd>
            {t("fermer", "close")}
          </span>
          <span className="palette-footer-end">
            <kbd className="palette-kbd">Ctrl K</kbd>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CommandRow({ item }: { item: Extract<Item, { kind: "page" | "action" }> }) {
  return (
    <>
      <span className="palette-icon">
        <Icon name={item.icon} size={16} strokeWidth={2} />
      </span>
      <span className="palette-label">{item.label}</span>
      <span className="palette-hint">{item.kind === "page" ? t("Page", "Page") : item.hint}</span>
    </>
  );
}

function MatchRow({ game }: { game: RecentMatch }) {
  const icon = agentIcon(game.agentId);
  return (
    <>
      <span className="palette-agent">
        {icon ? <img src={icon} alt="" loading="lazy" /> : <Icon name="agents" size={16} />}
      </span>
      <span className="palette-match-main">
        <strong>{game.mapName ?? t("Map inconnue", "Unknown map")}</strong>
        <span>{game.agentName ?? t("Agent inconnu", "Unknown agent")}</span>
      </span>
      <span className={`palette-result ${game.won ? "won" : "lost"}`}>
        {game.won ? t("Victoire", "Victory") : t("Défaite", "Defeat")} {game.roundsWon}-{game.roundsLost}
      </span>
      <span className="palette-kda">
        {game.kills} / {game.deaths} / {game.assists}
      </span>
      <span className="palette-hint palette-time">{timeAgo(game.startedAt)}</span>
    </>
  );
}

export function useCommandPaletteShortcut(setOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.repeat) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
