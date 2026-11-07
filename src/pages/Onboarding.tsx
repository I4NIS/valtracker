import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState, type FormEvent } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { TitleBar } from "../components/TitleBar";
import { api, errorMessage, onSyncProgress, type Account, type SyncProgress } from "../lib/api";
import { HENRIK_DASHBOARD, REGIONS, tierLabel } from "../lib/assets";
import { t } from "../lib/i18n";

type Step = "welcome" | "key" | "account" | "sync";

const ORDER: Step[] = ["welcome", "key", "account", "sync"];

const STAGES = ["Rang", "Historique de RR", "Matchs compétitifs", "Matchs plus anciens"];

const STAGES_EN = ["Rank", "RR history", "Competitive matches", "Older matches"];

function stageIndex(stage: string): number {
  return STAGES.findIndex((item, i) => stage.startsWith(item) || stage.startsWith(STAGES_EN[i]));
}

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
              <div className="wizard-steps" aria-label={t(`Étape ${current} sur 3`, `Step ${current} of 3`)}>
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
                  <h1 className="title">{t("Bienvenue sur Valtracker", "Welcome to Valtracker")}</h1>
                  <p className="hint">{t("Ton suivi Valorant, configuré en moins de deux minutes.", "Your Valorant tracker, set up in under two minutes.")}</p>
                </div>
                <div className="steps">
                  <Highlight
                    icon="home"
                    title={t("Tes stats, acte par acte", "Your stats, Act by Act")}
                    text={t("Rang, ACS, K/D, headshots, comparés à tes lobbys.", "Rank, ACS, K/D, headshots, compared with your lobbies.")}
                  />
                  <Highlight
                    icon="heatmaps"
                    title={t("Chaque mort analysée", "Every death analyzed")}
                    text={t("Où, comment et pourquoi tu meurs, match après match.", "Where, how and why you die, match after match.")}
                  />
                  <Highlight
                    icon="check"
                    title={t("Rien n'est lu dans le jeu", "Nothing is read from the game")}
                    text={t("Tout vient de l'API HenrikDev, une fois tes matchs terminés.", "Everything comes from the HenrikDev API, once your matches are over.")}
                  />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => go("key")}>
                  {t("Commencer", "Get started")}
                </button>
              </>
            )}

            {step === "key" && (
              <form className="wizard" onSubmit={submitKey}>
                <div className="stack">
                  <span className="eyebrow">{t("Étape 1 sur 3", "Step 1 of 3")}</span>
                  <h1 className="title">{t("Ta clé API HenrikDev", "Your HenrikDev API key")}</h1>
                  <p className="hint">
                    {t(
                      "Valtracker récupère tes matchs grâce à l'API gratuite de HenrikDev. Il te faut une clé personnelle.",
                      "Valtracker fetches your matches through the free HenrikDev API. You need a personal key.",
                    )}
                  </p>
                </div>
                <ol className="key-steps">
                  <li>{t("Ouvre le tableau de bord HenrikDev et connecte-toi.", "Open the HenrikDev dashboard and sign in.")}</li>
                  <li>{t("Crée une nouvelle clé, c'est gratuit.", "Create a new key, it's free.")}</li>
                  <li>{t("Copie-la et colle-la ci-dessous.", "Copy it and paste it below.")}</li>
                </ol>
                <button type="button" className="btn btn-secondary" onClick={() => openUrl(HENRIK_DASHBOARD)}>
                  <Icon name="external" size={16} strokeWidth={2} />
                  {t("Ouvrir le tableau de bord HenrikDev", "Open the HenrikDev dashboard")}
                </button>
                <div className="field">
                  <label htmlFor="api-key">{t("Clé API", "API key")}</label>
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
                  <span className="hint">
                    {t("Elle reste sur ton PC. Tu pourras la changer dans les paramètres.", "It stays on your PC. You can change it in the settings.")}
                  </span>
                </div>
                {error && <p className="form-error">{error}</p>}
                <div className="row between">
                  <button type="button" className="btn btn-secondary" onClick={() => go("welcome")}>
                    {t("Retour", "Back")}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy || !key.trim()}>
                    {t("Continuer", "Continue")}
                  </button>
                </div>
              </form>
            )}

            {step === "account" && (
              <form className="wizard" onSubmit={submitAccount}>
                <div className="stack">
                  <span className="eyebrow">{t("Étape 2 sur 3", "Step 2 of 3")}</span>
                  <h1 className="title">{t("Ton compte Riot", "Your Riot account")}</h1>
                  <p className="hint">{t("Ton Riot ID est affiché en haut de ton profil dans Valorant.", "Your Riot ID is shown at the top of your profile in Valorant.")}</p>
                </div>
                <div className="field">
                  <label htmlFor="riot-id">{t("Riot ID", "Riot ID")}</label>
                  <input
                    id="riot-id"
                    className="input"
                    placeholder={t("Pseudo#TAG", "Name#TAG")}
                    value={riotId}
                    onChange={(event) => setRiotId(event.target.value)}
                    spellCheck={false}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="region">{t("Région", "Region")}</label>
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
                    {hasApiKey ? t("Changer de clé", "Change key") : t("Retour", "Back")}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy || !riotId.includes("#")}>
                    {busy ? t("Recherche...", "Searching...") : t("Trouver mon compte", "Find my account")}
                  </button>
                </div>
              </form>
            )}

            {step === "sync" && account && (
              <>
                <div className="stack">
                  <span className="eyebrow">{t("Étape 3 sur 3", "Step 3 of 3")}</span>
                  <h1 className="title">{t(`Salut ${account.name} !`, `Hi ${account.name}!`)}</h1>
                  <p className="hint">
                    {t(
                      `Compte trouvé, niveau ${account.accountLevel ?? "?"}. Récupération de tes matchs en cours. La clé gratuite autorise 30 requêtes par minute, la première synchro peut prendre quelques minutes.`,
                      `Account found, level ${account.accountLevel ?? "?"}. Fetching your matches. The free key allows 30 requests per minute, so the first sync can take a few minutes.`,
                    )}
                  </p>
                </div>
                <SyncSteps progress={progress} />
                {progress?.error && <p className="form-error">{progress.error}</p>}
                <button type="button" className="btn btn-primary" onClick={() => onDone(account)}>
                  {progress && !progress.running ? t("Ouvrir Valtracker", "Open Valtracker") : t("Continuer pendant la synchro", "Continue while syncing")}
                </button>
                {progress && !progress.running && !progress.error && (
                  <p className="hint">
                    {t(
                      `${progress.newMatches} matchs récupérés${account.tierName ? `, rang ${tierLabel(account.tierName)}` : ""}.`,
                      `${progress.newMatches} ${progress.newMatches === 1 ? "match" : "matches"} fetched${account.tierName ? `, rank ${tierLabel(account.tierName)}` : ""}.`,
                    )}
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
  const currentIndex = progress?.running ? stageIndex(progress.stage) : -1;

  return (
    <div className="steps">
      <SyncLine state="done" label={t("Compte trouvé", "Account found")} />
      {STAGES.map((stage, i) => {
        const state = finished || (currentIndex >= 0 && i < currentIndex) ? "done" : i === currentIndex ? "run" : "wait";
        const count = progress?.newMatches ?? 0;
        const sub =
          i === currentIndex && stage.startsWith("Matchs")
            ? t(`${count} nouveaux matchs`, `${count} new ${count === 1 ? "match" : "matches"}`)
            : undefined;
        return <SyncLine key={stage} state={state} label={t(stage, STAGES_EN[i])} sub={sub} />;
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
