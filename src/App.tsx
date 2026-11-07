import { useCallback, useEffect, useRef, useState } from "react";
import { CommandPalette, useCommandPaletteShortcut } from "./components/CommandPalette";
import { Shell, type Page, type SyncView, type TourTarget } from "./components/Shell";
import { TitleBar } from "./components/TitleBar";
import { Tour } from "./components/Tour";
import { UpdateBanner } from "./components/UpdateBanner";
import { listen } from "@tauri-apps/api/event";
import { api, errorMessage, onSyncProgress, type Account, type Bootstrap, type Theme } from "./lib/api";
import { prefetchAccount } from "./lib/queries";
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

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [page, setPage] = useState<Page>("home");
  const [openMatch, setOpenMatch] = useState<string | null>(null);
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

  const showMatch = (matchId: string, round?: number, death = false) => {
    setPage("matches");
    setOpenMatch(matchId);
    setOpenRound(round);
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

  useEffect(() => {
    if (account) prefetchAccount(account.puuid).catch(() => undefined);
  }, [account?.puuid, refreshKey]);
  const needsSetup = boot !== null && (!boot.hasApiKey || boot.accounts.length === 0);

  useEffect(() => {
    setSync((current) => ({ ...current, lastSyncAt: account?.lastSyncAt ?? null }));
  }, [account?.lastSyncAt]);

  const runSync = useCallback(() => {
    if (account) api.syncAccount(account.puuid).catch(() => undefined);
  }, [account]);

  useEffect(() => {
    if (!boot || needsSetup || launched.current || !account) return;
    launched.current = true;
    runSync();
  }, [boot, needsSetup, account, runSync]);

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
    <>
      <Shell
        page={page}
        onNavigate={navigate}
        account={account}
        theme={theme}
        onToggleTheme={() => changeTheme(theme === "dark" ? "light" : "dark")}
        sync={sync}
        onSync={runSync}
        tourTarget={tourOpen ? tourTarget : null}
        onSearch={() => setPaletteOpen(true)}
      >
        {page === "home" && account && <Home account={account} refreshKey={refreshKey} onOpenMatch={showMatch} />}
        {page === "matches" && account && !openMatch && <Matches account={account} refreshKey={refreshKey} onOpen={showMatch} />}
        {page === "heatmaps" && account && <Heatmaps account={account} refreshKey={refreshKey} />}
        {page === "progress" && account && <Progression account={account} refreshKey={refreshKey} />}
        {page === "agents" && account && <Agents account={account} refreshKey={refreshKey} />}
        {page === "maps" && account && <Maps account={account} refreshKey={refreshKey} />}
        {page === "weapons" && account && <Weapons account={account} refreshKey={refreshKey} onOpenRound={showMatch} />}
        {page === "duels" && account && <Duels account={account} refreshKey={refreshKey} onOpenRound={showMatch} />}
        {page === "journal" && account && <Journal account={account} refreshKey={refreshKey} onOpenMatch={showMatch} />}
        {page === "matches" && account && openMatch && (
          <MatchDetail account={account} matchId={openMatch} initialRound={openRound} initialDeath={openDeath} onBack={() => setOpenMatch(null)} />
        )}
        {page === "settings" && (
          <Settings
            accounts={boot.accounts}
            activePuuid={boot.activePuuid}
            theme={theme}
            onTheme={changeTheme}
            notifyMatches={boot.notifyMatches}
            onNotifyMatches={changeNotify}
            onAccountsChanged={accountsChanged}
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
    </>
  );
}
