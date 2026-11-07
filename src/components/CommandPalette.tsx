import "../styles/palette.css";
import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { api, type Account, type RecentMatch, type Theme } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { timeAgo } from "../lib/format";
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
  syncing?: boolean;
};

type Item =
  | { kind: "page"; key: string; label: string; icon: IconName; haystack: string; run: () => void }
  | { kind: "action"; key: string; label: string; hint: string; icon: IconName; haystack: string; run: () => void }
  | { kind: "match"; key: string; match: RecentMatch; haystack: string; run: () => void };

type Section = { id: string; title: string; items: Item[] };

const PAGES: { page: Page; label: string; icon: IconName; keywords: string }[] = [
  { page: "home", label: "Accueil", icon: "home", keywords: "home dashboard tableau de bord resume" },
  { page: "matches", label: "Matchs", icon: "matches", keywords: "historique parties games" },
  { page: "progress", label: "Progression", icon: "progress", keywords: "rang rr elo courbe evolution" },
  { page: "agents", label: "Agents", icon: "agents", keywords: "personnages roles" },
  { page: "maps", label: "Maps", icon: "maps", keywords: "cartes attaque defense" },
  { page: "weapons", label: "Armes", icon: "weapons", keywords: "weapons precision headshots" },
  { page: "duels", label: "Duels", icon: "duels", keywords: "opening clutch matchups" },
  { page: "heatmaps", label: "Heatmaps", icon: "heatmaps", keywords: "positions morts kills carte chaleur" },
  { page: "journal", label: "Journal", icon: "journal", keywords: "notes tags" },
  { page: "settings", label: "Paramètres", icon: "settings", keywords: "settings comptes cle api reglages options" },
];

const MATCH_LIMIT = 50;

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
    date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    date.toLocaleDateString("fr-FR"),
    `${date.getDate()}/${date.getMonth() + 1}`,
  ];
  if (date.toDateString() === now.toDateString()) parts.push("aujourd'hui aujourdhui");
  if (date.toDateString() === yesterday.toDateString()) parts.push("hier");
  return parts.join(" ");
}

function matchHaystack(game: RecentMatch): string {
  return normalize(
    [
      game.mapName ?? "map inconnue",
      game.agentName ?? "",
      game.won ? "victoire win gagne" : "defaite loss perdu",
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

export function CommandPalette({
  open,
  onClose,
  account,
  onNavigate,
  onOpenMatch,
  onToggleTheme,
  onSync,
  onReplayTour,
  theme,
  syncing = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const puuid = account?.puuid ?? null;

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      returnFocus.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !puuid) {
      if (!puuid) setRecent([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .getRecentMatches(puuid, MATCH_LIMIT, 0)
      .then((rows) => {
        if (alive) setRecent(rows);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, puuid]);

  const sections = useMemo<Section[]>(() => {
    const terms = words(query);
    const finish = (run: () => void) => () => {
      onClose();
      run();
    };

    const pages: Item[] = PAGES.map((entry) => ({
      kind: "page" as const,
      key: `page-${entry.page}`,
      label: entry.label,
      icon: entry.icon,
      haystack: normalize(`${entry.label} ${entry.page} page aller ${entry.keywords}`),
      run: finish(() => onNavigate(entry.page)),
    }));

    const actions: Item[] = [];
    if (account) {
      actions.push({
        kind: "action",
        key: "action-sync",
        label: "Synchroniser maintenant",
        hint: syncing ? "En cours" : "Action",
        icon: "sync",
        haystack: normalize("Synchroniser maintenant sync synchro actualiser rafraichir mettre a jour"),
        run: finish(onSync),
      });
    }
    actions.push(
      {
        kind: "action",
        key: "action-theme",
        label: "Changer de thème",
        hint: theme === "dark" ? "Passer en clair" : theme === "light" ? "Passer en sombre" : "Action",
        icon: theme === "light" ? "moon" : "sun",
        haystack: normalize("Changer de thème theme clair sombre dark light mode apparence"),
        run: finish(onToggleTheme),
      },
      {
        kind: "action",
        key: "action-tour",
        label: "Revoir le tutoriel",
        hint: "Action",
        icon: "arrowRight",
        haystack: normalize("Revoir le tutoriel tour aide guide visite decouverte"),
        run: finish(onReplayTour),
      },
    );

    const games: Item[] = recent.map((game) => ({
      kind: "match" as const,
      key: `match-${game.matchId}`,
      match: game,
      haystack: matchHaystack(game),
      run: finish(() => onOpenMatch(game.matchId)),
    }));

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
      { id: "pages", title: "Pages", items: pick(pages, true) },
      { id: "actions", title: "Actions", items: pick(actions, true) },
      { id: "matches", title: "Matchs", items: pick(games, false) },
    ].filter((section) => section.items.length > 0);
  }, [query, recent, account, theme, syncing, onClose, onNavigate, onOpenMatch, onToggleTheme, onSync, onReplayTour]);

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const count = flat.length;
  const current = Math.min(active, Math.max(count - 1, 0));

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [current, open, count]);

  if (!open) return null;

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
        aria-label="Palette de commandes"
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
            aria-label="Rechercher une page, une action ou un match"
            placeholder="Rechercher une page, une action, un match..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="palette-kbd">Échap</kbd>
        </div>

        <div className="palette-list" id={listId} role="listbox" aria-label="Résultats" ref={listRef}>
          {count === 0 && (
            <div className="palette-empty" role="presentation">
              <strong>Aucun résultat</strong>
              <span>Essaie un nom de map, un agent, « victoire », « défaite » ou une date.</span>
            </div>
          )}
          {sections.map((section) => (
            <div className="palette-section" role="group" aria-labelledby={`${baseId}-${section.id}`} key={section.id}>
              <div className="palette-section-title" id={`${baseId}-${section.id}`} role="presentation">
                <span>{section.title}</span>
                {section.id === "matches" && loading && <span className="palette-loading">Chargement</span>}
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
                      Entrée
                    </kbd>
                  </div>
                );
              })}
            </div>
          ))}
          {!loading && failed && recent.length === 0 && (
            <div className="palette-note" role="presentation">
              Impossible de charger les matchs récents.
            </div>
          )}
        </div>

        <div className="palette-footer" aria-hidden="true">
          <span>
            <kbd className="palette-kbd">↑</kbd>
            <kbd className="palette-kbd">↓</kbd>
            naviguer
          </span>
          <span>
            <kbd className="palette-kbd">Entrée</kbd>
            ouvrir
          </span>
          <span>
            <kbd className="palette-kbd">Échap</kbd>
            fermer
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
      <span className="palette-hint">{item.kind === "page" ? "Page" : item.hint}</span>
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
        <strong>{game.mapName ?? "Map inconnue"}</strong>
        <span>{game.agentName ?? "Agent inconnu"}</span>
      </span>
      <span className={`palette-result ${game.won ? "won" : "lost"}`}>
        {game.won ? "Victoire" : "Défaite"} {game.roundsWon}-{game.roundsLost}
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
