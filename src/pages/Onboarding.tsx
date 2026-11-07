import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState, type FormEvent } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { TitleBar } from "../components/TitleBar";
import { api, errorMessage, onSyncProgress, type Account, type SyncProgress } from "../lib/api";
import { HENRIK_DASHBOARD, REGIONS, tierLabel } from "../lib/assets";

type Step = "welcome" | "key" | "account" | "sync";

const ORDER: Step[] = ["welcome", "key", "account", "sync"];

const STAGES = ["Rang", "Historique de RR", "Matchs compétitifs", "Matchs plus anciens"];

type Props = {
  hasApiKey: boolean;
  onDone: (account: Account) => void;
};

export function Onboarding({ hasApiKey, onDone }: Props) {
  const [step, setStep] = useState<Step>(hasApiKey ? "account" : "welcome");
  const [key, setKey] = useState("");
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("eu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  useEffect(() => {
    if (step !== "sync" || !account) return;
    let stop: (() => void) | undefined;
    onSyncProgress((event) => {
      if (event.puuid === account.puuid) setProgress(event);
    }).then((unlisten) => {
      stop = unlisten;
    });
    api.syncAccount(account.puuid).catch(() => undefined);
    return () => stop?.();
  }, [step, account]);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const submitKey = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.saveApiKey(key);
      go("account");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const found = await api.addAccount(riotId, region);
      setAccount(found);
      go("sync");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const current = ORDER.indexOf(step);

  return (
    <div className="window">
      <TitleBar />
      <div className="onboarding">
        <div className="onboarding-panel">
          <div className="wizard">
            {step !== "welcome" && (
              <div className="wizard-steps" aria-label={`Étape ${current} sur 3`}>
                {ORDER.slice(1).map((item, i) => (
                  <span key={item} className={i < current ? "done" : undefined} />
                ))}
              </div>
            )}
  
            {step === "welcome" && (
              <>
                <div className="app-icon">
                  <Logo size={48} mono />
                </div>
                <div className="stack">
                  <h1 className="title">Bienvenue sur Valtracker</h1>
                  <p className="hint">Ton suivi Valorant, configuré en moins de deux minutes.</p>
                </div>
                <div className="steps">
                  <Highlight icon="home" title="Tes stats, acte par acte" text="Rang, ACS, K/D, headshots, comparés à tes lobbys." />
                  <Highlight icon="heatmaps" title="Chaque mort analysée" text="Où, comment et pourquoi tu meurs, match après match." />
                  <Highlight icon="check" title="Rien n'est lu dans le jeu" text="Tout vient de l'API HenrikDev, une fois tes matchs terminés." />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => go("key")}>
                  Commencer
                </button>
              </>
            )}
  
            {step === "key" && (
              <form className="wizard" onSubmit={submitKey}>
                <div className="stack">
                  <span className="eyebrow">Étape 1 sur 3</span>
                  <h1 className="title">Ta clé API HenrikDev</h1>
                  <p className="hint">
                    Valtracker récupère tes matchs grâce à l'API gratuite de HenrikDev. Il te faut une clé personnelle.
                  </p>
                </div>
                <ol className="key-steps">
                  <li>Ouvre le tableau de bord HenrikDev et connecte-toi.</li>
                  <li>Crée une nouvelle clé, c'est gratuit.</li>
                  <li>Copie-la et colle-la ci-dessous.</li>
                </ol>
                <button type="button" className="btn btn-secondary" onClick={() => openUrl(HENRIK_DASHBOARD)}>
                  <Icon name="external" size={16} strokeWidth={2} />
                  Ouvrir le tableau de bord HenrikDev
                </button>
                <div className="field">
                  <label htmlFor="api-key">Clé API</label>
                  <input
                    id="api-key"
                    className="input"
                    type="password"
                    placeholder="HDEV-xxxxxxxx-xxxx-xxxx"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  <span className="hint">Elle reste sur ton PC. Tu pourras la changer dans les paramètres.</span>
                </div>
                {error && <p className="form-error">{error}</p>}
                <div className="row between">
                  <button type="button" className="btn btn-secondary" onClick={() => go("welcome")}>
                    Retour
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy || !key.trim()}>
                    Continuer
                  </button>
                </div>
              </form>
            )}
  
            {step === "account" && (
              <form className="wizard" onSubmit={submitAccount}>
                <div className="stack">
                  <span className="eyebrow">Étape 2 sur 3</span>
                  <h1 className="title">Ton compte Riot</h1>
                  <p className="hint">Ton Riot ID est affiché en haut de ton profil dans Valorant.</p>
                </div>
                <div className="field">
                  <label htmlFor="riot-id">Riot ID</label>
                  <input
                    id="riot-id"
                    className="input"
                    placeholder="Pseudo#TAG"
                    value={riotId}
                    onChange={(event) => setRiotId(event.target.value)}
                    spellCheck={false}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="region">Région</label>
                  <select id="region" className="input" value={region} onChange={(event) => setRegion(event.target.value)}>
                    {REGIONS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p className="form-error">{error}</p>}
                <div className="row between">
                  <button type="button" className="btn btn-secondary" onClick={() => go("key")}>
                    {hasApiKey ? "Changer de clé" : "Retour"}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy || !riotId.includes("#")}>
                    {busy ? "Recherche..." : "Trouver mon compte"}
                  </button>
                </div>
              </form>
            )}
  
            {step === "sync" && account && (
              <>
                <div className="stack">
                  <span className="eyebrow">Étape 3 sur 3</span>
                  <h1 className="title">Salut {account.name} !</h1>
                  <p className="hint">
                    Compte trouvé, niveau {account.accountLevel ?? "?"}. Récupération de tes matchs en cours. La clé gratuite
                    autorise 30 requêtes par minute, la première synchro peut prendre quelques minutes.
                  </p>
                </div>
                <SyncSteps progress={progress} />
                {progress?.error && <p className="form-error">{progress.error}</p>}
                <button type="button" className="btn btn-primary" onClick={() => onDone(account)}>
                  {progress && !progress.running ? "Ouvrir Valtracker" : "Continuer pendant la synchro"}
                </button>
                {progress && !progress.running && !progress.error && (
                  <p className="hint">
                    {progress.newMatches} matchs récupérés{account.tierName ? `, rang ${tierLabel(account.tierName)}` : ""}.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Highlight({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="row">
      <span className="step-icon run">
        <Icon name={icon} size={15} strokeWidth={2.2} />
      </span>
      <span className="stack" style={{ gap: 2 }}>
        <strong>{title}</strong>
        <span className="hint">{text}</span>
      </span>
    </div>
  );
}

function SyncSteps({ progress }: { progress: SyncProgress | null }) {
  const finished = progress !== null && !progress.running;
  const currentIndex = progress?.running ? STAGES.findIndex((stage) => progress.stage.startsWith(stage)) : -1;

  return (
    <div className="steps">
      <SyncLine state="done" label="Compte trouvé" />
      {STAGES.map((stage, i) => {
        const state = finished || (currentIndex >= 0 && i < currentIndex) ? "done" : i === currentIndex ? "run" : "wait";
        const sub = i === currentIndex && stage.startsWith("Matchs") ? `${progress?.newMatches ?? 0} nouveaux matchs` : undefined;
        return <SyncLine key={stage} state={state} label={stage} sub={sub} />;
      })}
    </div>
  );
}

function SyncLine({ state, label, sub }: { state: "done" | "run" | "wait"; label: string; sub?: string }) {
  const icon: IconName = state === "done" ? "check" : state === "run" ? "running" : "wait";
  return (
    <div className="row">
      <span className={`step-icon ${state}`}>
        <Icon name={icon} size={14} strokeWidth={2.6} className={state === "run" ? "spin" : undefined} />
      </span>
      <span className="stack" style={{ gap: 2 }}>
        <span className={state === "wait" ? "muted" : undefined} style={{ fontWeight: 600 }}>
          {label}
        </span>
        {sub && <span className="faint">{sub}</span>}
      </span>
    </div>
  );
}
