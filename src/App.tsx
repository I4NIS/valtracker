import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CommandPalette, useCommandPaletteShortcut } from "./components/CommandPalette";
import { PickAccount } from "./components/PickAccount";
import { Shell, type Page, type SyncView, type TourTarget } from "./components/Shell";
import { TitleBar } from "./components/TitleBar";
import { Tour } from "./components/Tour";
import { UpdateBanner } from "./components/UpdateBanner";
import { listen } from "@tauri-apps/api/event";
import { asLang, setLang, type Lang } from "./lib/i18n";
import { api, errorMessage, onSyncProgress, type Account, type Bootstrap, type Theme } from "./lib/api";
import { ALL_ACCOUNTS, prefetchAccount } from "./lib/queries";
import { invalidate } from "./lib/query";
import { Agents } from "./pages/Agents";
import { Duels } from "./pages/Duels";
import { Heatmaps } from "./pages/Heatmaps";
import { Home } from "./pages/Home";
import { Journal } from "./pages/Journal";
import { Maps } from "./pages/Maps";
import { Progression } from "./pages/Progression";
import { MatchDetail } from "./pages/MatchDetail";
import { Matches } from "./pages/Matches";
import { Onboarding } from "./pages/Onboarding";
import { Settings } from "./pages/Settings";
import { Weapons } from "./pages/Weapons";

const IDLE: SyncView = { running: false, stage: "", newMatches: 0, error: null, lastSyncAt: null };

const SINGLE_ACCOUNT_PAGES: Page[] = ["progress", "agents", "maps", "weapons", "duels", "heatmaps", "journal"];

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [language, setLanguage] = useState<Lang>("fr");
  const [page, setPage] = useState<Page>("home");
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [openMatchOwner, setOpenMatchOwner] = useState<string | null>(null);
  const [openRound, setOpenRound] = useState<number | undefined>(undefined);
  const [openDeath, setOpenDeath] = useState(false);
  const [sync, setSync] = useState<SyncView>(IDLE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourTarget, setTourTarget] = useState<TourTarget | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const launched = useRef(false);

  useCommandPaletteShortcut(setPaletteOpen);

  const load = useCallback(async () => {
    const data = await api.bootstrap();
    const nextLang = asLang(data.language);
    setLang(nextLang);
    setLanguage(nextLang);
    setBoot(data);
    setTheme(data.theme);
    return data;
  }, []);

  useEffect(() => {
    load().catch((err) => setFatal(errorMessage(err)));
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [page, openMatch]);

  const navigate = (next: Page) => {
    setOpenMatch(null);
    setPage(next);
  };

  const showMatch = (matchId: string, round?: number, puuid?: string, death = false) => {
    setPage("matches");
    setOpenMatch(matchId);
    setOpenRound(round);
    setOpenMatchOwner(puuid ?? null);
    setOpenDeath(death);
  };

  useEffect(() => {
    let stop: (() => void) | undefined;
    onSyncProgress((progress) => {
      setSync((current) => ({
        ...current,
        running: progress.running,
        stage: progress.stage,
        newMatches: progress.newMatches,
        error: progress.error,
      }));
      if (!progress.running) load().catch(() => undefined);
    }).then((unlisten) => {
      stop = unlisten;
    });
    return () => stop?.();
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
  const matchAccount = (combined && combined.find((item) => item.puuid === openMatchOwner)) || account;
  const single = combined ? null : account;

  useEffect(() => {
    if (combined) prefetchAccount(ALL_ACCOUNTS).catch(() => undefined);
    else if (account) prefetchAccount(account.puuid).catch(() => undefined);
  }, [account?.puuid, combined !== null, refreshKey]);
  const needsSetup = boot !== null && (!boot.hasApiKey || boot.accounts.length === 0);

  useEffect(() => {
    setSync((current) => ({ ...current, lastSyncAt: account?.lastSyncAt ?? null }));
  }, [account?.lastSyncAt]);

  const runSync = useCallback(async () => {
    const targets = combined ?? (account ? [account] : []);
    for (const target of targets) await api.syncAccount(target.puuid).catch(() => undefined);
  }, [account, combined]);

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

  const changeTheme = (next: Theme) => {
    setTheme(next);
    api.setPreference("theme", next).catch(() => undefined);
  };

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

  if (needsSetup) return <Onboarding hasApiKey={boot.hasApiKey} onDone={finishSetup} />;

  return (
    <Fragment key={language}>
      <Shell
        page={page}
        onNavigate={navigate}
        account={account}
        combinedCount={combined?.length ?? 0}
        theme={theme}
        onToggleTheme={() => changeTheme(theme === "dark" ? "light" : "dark")}
        sync={sync}
        onSync={runSync}
        tourTarget={tourOpen ? tourTarget : null}
        onSearch={() => setPaletteOpen(true)}
      >
        {page === "home" && account && (
          <Home account={account} accounts={combined} refreshKey={refreshKey} onOpenMatch={showMatch} />
        )}
        {page === "matches" && account && !openMatch && (
          <Matches account={account} accounts={combined} refreshKey={refreshKey} onOpen={showMatch} />
        )}
        {combined && SINGLE_ACCOUNT_PAGES.includes(page) && <PickAccount accounts={combined} onPick={accountsChanged} />}
        {single && page === "heatmaps" && <Heatmaps account={single} refreshKey={refreshKey} />}
        {single && page === "progress" && <Progression account={single} refreshKey={refreshKey} />}
        {single && page === "agents" && <Agents account={single} refreshKey={refreshKey} />}
        {single && page === "maps" && <Maps account={single} refreshKey={refreshKey} onOpenRound={showMatch} />}
        {single && page === "weapons" && <Weapons account={single} refreshKey={refreshKey} onOpenRound={showMatch} />}
        {single && page === "duels" && <Duels account={single} refreshKey={refreshKey} onOpenRound={showMatch} />}
        {single && page === "journal" && <Journal account={single} refreshKey={refreshKey} onOpenMatch={showMatch} />}
        {page === "matches" && matchAccount && openMatch && (
          <MatchDetail account={matchAccount} matchId={openMatch} initialRound={openRound} initialDeath={openDeath} onBack={() => setOpenMatch(null)} />
        )}
        {page === "settings" && (
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
            onReplayTour={() => setTourOpen(true)}
          />
        )}
      </Shell>
      {tourOpen && <Tour onTarget={setTourTarget} onClose={closeTour} />}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        account={account}
        theme={theme}
        syncing={sync.running}
        onNavigate={navigate}
        onOpenMatch={showMatch}
        onToggleTheme={() => changeTheme(theme === "dark" ? "light" : "dark")}
        onSync={runSync}
        onReplayTour={() => setTourOpen(true)}
      />
      <UpdateBanner />
    </Fragment>
  );
}
