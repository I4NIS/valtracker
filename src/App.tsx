import { getVersion } from "@tauri-apps/api/app";
import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CommandPalette, useCommandPaletteShortcut } from "./components/CommandPalette";
import { loadExportDialog } from "./components/ExportRecap";
import { PickAccount } from "./components/PickAccount";
import { Shell, type Page, type TourTarget } from "./components/Shell";
import { TitleBar } from "./components/TitleBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { WhatsNew } from "./components/WhatsNew";
import { CHANGELOG, compareVersions, FIRST_TRACKED, releasesSince, type Release } from "./lib/changelog";
import { whenIdle } from "./lib/idle";
import { listen } from "@tauri-apps/api/event";
import { asLang, setLang, t, type Lang } from "./lib/i18n";
import { api, errorMessage, onSyncProgress, type Account, type Bootstrap, type Theme } from "./lib/api";
import { currentBackLabel, PageVisible } from "./lib/navigation";
import { ALL_ACCOUNTS, prefetchAccount, queries } from "./lib/queries";
import { invalidate, peek } from "./lib/query";
import { updateSync } from "./lib/sync";
import { Agents } from "./pages/Agents";
import { Duels } from "./pages/Duels";
import { Heatmaps } from "./pages/Heatmaps";
import { Home } from "./pages/Home";
import { Journal } from "./pages/Journal";
import { Maps } from "./pages/Maps";
import { Progression } from "./pages/Progression";
import { MatchDetail } from "./pages/MatchDetail";
import { Matches } from "./pages/Matches";
import { Weapons } from "./pages/Weapons";

const loadOnboarding = () => import("./pages/Onboarding");
const loadSettings = () => import("./pages/Settings");
const loadTour = () => import("./components/Tour");

const Onboarding = lazy(() => loadOnboarding().then((module) => ({ default: module.Onboarding })));
const Settings = lazy(() => loadSettings().then((module) => ({ default: module.Settings })));
const Tour = lazy(() => loadTour().then((module) => ({ default: module.Tour })));

function preloadRareScreens() {
  const steps: (() => Promise<unknown>)[] = [loadSettings, loadExportDialog, loadTour, loadOnboarding];
  steps.reduce<Promise<unknown>>((chain, step) => chain.then(() => whenIdle()).then(step).catch(() => undefined), Promise.resolve());
}

type News = { releases: Release[]; installed: string | null };

type OpenMatch = { id: string; round?: number; owner: string | null; death: boolean };

type Frame = { match: OpenMatch | null; scroll: number; label: string };

const PAGE_BACK: Record<Page, () => string> = {
  home: () => t("Retour à l'accueil", "Back to home"),
  matches: () => t("Retour aux matchs", "Back to matches"),
  progress: () => t("Retour à la progression", "Back to progression"),
  agents: () => t("Retour aux agents", "Back to agents"),
  maps: () => t("Retour aux maps", "Back to maps"),
  weapons: () => t("Retour aux armes", "Back to weapons"),
  duels: () => t("Retour aux duels", "Back to duels"),
  heatmaps: () => t("Retour aux heatmaps", "Back to heatmaps"),
  journal: () => t("Retour au journal", "Back to journal"),
  settings: () => t("Retour aux paramètres", "Back to settings"),
};

const mainNode = () => document.querySelector<HTMLElement>(".main");

const SINGLE_ACCOUNT_PAGES: Page[] = ["progress", "agents", "maps", "weapons", "duels", "heatmaps", "journal"];

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(b) as (keyof T)[];
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key]);
}

function keepSame(current: Bootstrap | null, next: Bootstrap): Bootstrap {
  if (!current) return next;
  const accounts = next.accounts.map((item) => {
    const old = current.accounts.find((entry) => entry.puuid === item.puuid);
    return old && shallowEqual(old, item) ? old : item;
  });
  const sameList = accounts.length === current.accounts.length && accounts.every((item, index) => item === current.accounts[index]);
  const merged = { ...next, accounts: sameList ? current.accounts : accounts };
  return shallowEqual(current, merged) ? current : merged;
}

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [language, setLanguage] = useState<Lang>("fr");
  const [page, setPage] = useState<Page>("home");
  const pageRef = useRef(page);
  pageRef.current = page;
  const [openMatch, setOpenMatch] = useState<OpenMatch | null>(null);
  const openRef = useRef(openMatch);
  openRef.current = openMatch;
  const [history, setHistory] = useState<Frame[]>([]);
  const restore = useRef<number | null>(null);
  const matchPuuid = useRef("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourTarget, setTourTarget] = useState<TourTarget | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [news, setNews] = useState<News | null>(null);
  const newsChecked = useRef(false);
  const launched = useRef(false);
  const themeRef = useRef<Theme>("dark");

  useCommandPaletteShortcut(setPaletteOpen);

  const load = useCallback(async () => {
    const data = await api.bootstrap();
    const nextLang = asLang(data.language);
    setLang(nextLang);
    setLanguage(nextLang);
    setBoot((current) => keepSame(current, data));
    themeRef.current = data.theme;
    setTheme(data.theme);
    return data;
  }, []);

  useEffect(() => {
    load().catch((err) => setFatal(errorMessage(err)));
  }, [load]);

  useEffect(() => {
    preloadRareScreens();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useLayoutEffect(() => {
    const target = restore.current;
    restore.current = null;
    mainNode()?.scrollTo({ top: target ?? 0 });
  }, [page, openMatch]);

  const navigate = useCallback((next: Page) => {
    setOpenMatch(null);
    setHistory([]);
    setPage(next);
  }, []);

  const showMatch = useCallback((matchId: string, round?: number, puuid?: string, death = false) => {
    const from = openRef.current;
    const name = from ? peek<{ mapName: string | null }>(queries.match(matchPuuid.current, from.id).key)?.mapName : null;
    const label = from
      ? name
        ? t(`Retour au match sur ${name}`, `Back to the match on ${name}`)
        : t("Retour au match", "Back to the match")
      : (currentBackLabel() ?? PAGE_BACK[pageRef.current]());
    setHistory((stack) => [...stack, { match: from, scroll: mainNode()?.scrollTop ?? 0, label }]);
    setOpenMatch({ id: matchId, round, owner: puuid ?? null, death });
  }, []);

  const goBack = useCallback(() => {
    const frame = history[history.length - 1];
    setHistory((stack) => stack.slice(0, -1));
    restore.current = frame?.scroll ?? 0;
    setOpenMatch(frame?.match ?? null);
  }, [history]);

  useEffect(() => {
    const stop = onSyncProgress((progress) => {
      updateSync({ running: progress.running, stage: progress.stage, newMatches: progress.newMatches, error: progress.error });
      if (!progress.running) load().catch(() => undefined);
    });
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, [load]);

  useEffect(() => {
    const stop = listen("data-changed", () => {
      invalidate();
      setRefreshKey((key) => key + 1);
    });
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, []);

  const account: Account | null = boot?.accounts.find((item) => item.puuid === boot.activePuuid) ?? null;
  const combined = boot !== null && boot.combined && boot.accounts.length > 1 ? boot.accounts : null;
  const matchAccount = (combined && combined.find((item) => item.puuid === openMatch?.owner)) || account;
  matchPuuid.current = matchAccount?.puuid ?? "";
  const single = combined ? null : account;

  useEffect(() => {
    if (combined) prefetchAccount(ALL_ACCOUNTS, pageRef.current).catch(() => undefined);
    else if (account) prefetchAccount(account.puuid, pageRef.current).catch(() => undefined);
  }, [account?.puuid, combined !== null, refreshKey]);
  const needsSetup = boot !== null && (!boot.hasApiKey || boot.accounts.length === 0);

  useEffect(() => {
    updateSync({ lastSyncAt: account?.lastSyncAt ?? null });
  }, [account?.lastSyncAt]);

  const runSync = useCallback(async () => {
    const targets = combined ?? (account ? [account] : []);
    for (const target of targets) await api.syncAccount(target.puuid).catch(() => undefined);
  }, [account, combined]);

  useEffect(() => {
    if (!boot || needsSetup || newsChecked.current) return;
    newsChecked.current = true;
    getVersion()
      .then((current) => {
        const seen = boot.seenVersion ?? FIRST_TRACKED;
        if (compareVersions(current, seen) <= 0) return;
        const releases = releasesSince(seen, current);
        if (releases.length > 0) setNews({ releases, installed: current });
        else api.setPreference("seen_version", current).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [boot, needsSetup]);

  const closeNews = useCallback(() => {
    setNews((current) => {
      if (current?.installed) api.setPreference("seen_version", current.installed).catch(() => undefined);
      return null;
    });
  }, []);

  const showChangelog = useCallback(() => setNews({ releases: CHANGELOG(), installed: null }), []);

  useEffect(() => {
    if (!boot || needsSetup || launched.current || !account) return;
    launched.current = true;
    runSync();
  }, [boot, needsSetup, account, runSync]);

  const changeLanguage = (next: Lang) => {
    setLang(next);
    setLanguage(next);
    invalidate();
    api.setPreference("language", next).catch(() => undefined);
  };

  const changeTheme = useCallback((next: Theme) => {
    themeRef.current = next;
    setTheme(next);
    api.setPreference("theme", next).catch(() => undefined);
  }, []);

  const toggleTheme = useCallback(() => changeTheme(themeRef.current === "dark" ? "light" : "dark"), [changeTheme]);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const replayTour = useCallback(() => setTourOpen(true), []);

  const changeNotify = (next: boolean) => {
    setBoot((current) => (current ? { ...current, notifyMatches: next } : current));
    api.setPreference("notify_matches", next ? "true" : "false").catch(() => undefined);
  };

  const closeTour = useCallback(() => {
    setTourOpen(false);
    setTourTarget(null);
    api.setPreference("tutorial_done", "true").catch(() => undefined);
  }, []);

  const finishSetup = async () => {
    launched.current = true;
    newsChecked.current = true;
    getVersion()
      .then((current) => api.setPreference("seen_version", current))
      .catch(() => undefined);
    const data = await load();
    setPage("home");
    if (!data.tutorialDone) setTourOpen(true);
  };

  const accountsChanged = async (activePuuid?: string) => {
    if (activePuuid) await api.setActiveAccount(activePuuid);
    const data = await load();
    setRefreshKey((key) => key + 1);
    const active = data.accounts.find((item) => item.puuid === data.activePuuid);
    if (active && activePuuid) api.syncAccount(active.puuid).catch(() => undefined);
  };

  const showCombined = async () => {
    await api.setCombinedView(true);
    await load();
    setRefreshKey((key) => key + 1);
  };

  if (fatal) {
    return (
      <div className="window">
        <TitleBar />
        <div className="onboarding">
          <div className="onboarding-panel">
            <p className="form-error">{fatal}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!boot) return null;

  if (needsSetup) {
    return (
      <Suspense fallback={null}>
        <Onboarding hasApiKey={boot.hasApiKey} onDone={finishSetup} />
      </Suspense>
    );
  }

  return (
    <Fragment key={language}>
      <Shell
        page={page}
        onNavigate={navigate}
        account={account}
        combinedCount={combined?.length ?? 0}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSync={runSync}
        tourTarget={tourOpen ? tourTarget : null}
        onSearch={() => setPaletteOpen(true)}
      >
        <div className="page-layer" hidden={openMatch !== null}>
          <PageVisible.Provider value={openMatch === null}>
            {page === "home" && account && (
              <Home account={account} accounts={combined} refreshKey={refreshKey} onOpenMatch={showMatch} />
            )}
            {page === "matches" && account && (
              <Matches account={account} accounts={combined} refreshKey={refreshKey} onOpen={showMatch} />
            )}
            {combined && SINGLE_ACCOUNT_PAGES.includes(page) && <PickAccount accounts={combined} onPick={accountsChanged} />}
            {single && page === "heatmaps" && <Heatmaps account={single} refreshKey={refreshKey} />}
            {single && page === "progress" && <Progression account={single} refreshKey={refreshKey} />}
            {single && page === "agents" && <Agents account={single} refreshKey={refreshKey} onOpenMatch={showMatch} />}
            {single && page === "maps" && <Maps account={single} refreshKey={refreshKey} onOpenRound={showMatch} />}
            {single && page === "weapons" && <Weapons account={single} refreshKey={refreshKey} onOpenRound={showMatch} />}
            {single && page === "duels" && <Duels account={single} refreshKey={refreshKey} onOpenRound={showMatch} />}
            {single && page === "journal" && <Journal account={single} refreshKey={refreshKey} onOpenMatch={showMatch} />}
            {page === "settings" && (
              <Suspense fallback={null}>
                <Settings
                  accounts={boot.accounts}
                  activePuuid={boot.activePuuid}
                  combined={combined !== null}
                  theme={theme}
                  onTheme={changeTheme}
                  language={language}
                  onLanguage={changeLanguage}
                  notifyMatches={boot.notifyMatches}
                  onNotifyMatches={changeNotify}
                  onAccountsChanged={accountsChanged}
                  onCombined={showCombined}
                  onReplayTour={replayTour}
                  onShowChangelog={showChangelog}
                />
              </Suspense>
            )}
          </PageVisible.Provider>
        </div>
        {matchAccount && openMatch && (
          <MatchDetail
            key={`${openMatch.id}-${history.length}`}
            account={matchAccount}
            matchId={openMatch.id}
            initialRound={openMatch.round}
            initialDeath={openMatch.death}
            backLabel={history[history.length - 1]?.label ?? PAGE_BACK[page]()}
            onBack={goBack}
          />
        )}
      </Shell>
      {tourOpen && (
        <Suspense fallback={null}>
          <Tour onTarget={setTourTarget} onClose={closeTour} />
        </Suspense>
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        account={account}
        theme={theme}
        onNavigate={navigate}
        onOpenMatch={showMatch}
        onToggleTheme={toggleTheme}
        onSync={runSync}
        onReplayTour={replayTour}
      />
      {news && !tourOpen && <WhatsNew releases={news.releases} installed={news.installed} onNavigate={navigate} onClose={closeNews} />}
      <UpdateBanner />
    </Fragment>
  );
}
