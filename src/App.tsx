import { useCallback, useEffect, useRef, useState } from "react";
import { Shell, type Page, type SyncView, type TourTarget } from "./components/Shell";
import { TitleBar } from "./components/TitleBar";
import { Tour } from "./components/Tour";
import { api, errorMessage, onSyncProgress, type Account, type Bootstrap, type Theme } from "./lib/api";
import { Home } from "./pages/Home";
import { Onboarding } from "./pages/Onboarding";
import { Settings } from "./pages/Settings";
import { Soon } from "./pages/Soon";

const SOON: Partial<Record<Page, { title: string; text: string }>> = {
  matches: { title: "Matchs", text: "Le détail de chaque match, le score des dix joueurs et les défauts détectés." },
  progress: { title: "Progression", text: "Ta courbe de RR, ta forme, ta projection et la détection du tilt." },
  agents: { title: "Agents", text: "Tes statistiques agent par agent." },
  maps: { title: "Maps", text: "Tes statistiques map par map, en attaque et en défense." },
  weapons: { title: "Armes", text: "Tes kills, ta précision et tes headshots par arme." },
  duels: { title: "Duels", text: "Opening duels, clutchs, matchups contre chaque agent." },
  heatmaps: { title: "Heatmaps", text: "Tes morts, tes kills et la position de tes tueurs, map par map." },
  journal: { title: "Journal", text: "Tes notes et tags sur tes matchs." },
};

const IDLE: SyncView = { running: false, stage: "", newMatches: 0, error: null, lastSyncAt: null };

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [page, setPage] = useState<Page>("home");
  const [sync, setSync] = useState<SyncView>(IDLE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourTarget, setTourTarget] = useState<TourTarget | null>(null);
  const launched = useRef(false);

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
    let stop: (() => void) | undefined;
    onSyncProgress((progress) => {
      setSync((current) => ({
        ...current,
        running: progress.running,
        stage: progress.stage,
        newMatches: progress.newMatches,
        error: progress.error,
      }));
      if (!progress.running) {
        load().catch(() => undefined);
        setRefreshKey((key) => key + 1);
      }
    }).then((unlisten) => {
      stop = unlisten;
    });
    return () => stop?.();
  }, [load]);

  const account: Account | null = boot?.accounts.find((item) => item.puuid === boot.activePuuid) ?? null;
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

  const soon = SOON[page];

  return (
    <>
      <Shell
        page={page}
        onNavigate={setPage}
        account={account}
        theme={theme}
        onToggleTheme={() => changeTheme(theme === "dark" ? "light" : "dark")}
        sync={sync}
        onSync={runSync}
        tourTarget={tourOpen ? tourTarget : null}
      >
        {page === "home" && account && <Home account={account} refreshKey={refreshKey} />}
        {page === "settings" && (
          <Settings
            accounts={boot.accounts}
            activePuuid={boot.activePuuid}
            theme={theme}
            onTheme={changeTheme}
            onAccountsChanged={accountsChanged}
            onReplayTour={() => setTourOpen(true)}
          />
        )}
        {soon && <Soon title={soon.title} text={soon.text} />}
      </Shell>
      {tourOpen && <Tour onTarget={setTourTarget} onClose={closeTour} />}
    </>
  );
}
