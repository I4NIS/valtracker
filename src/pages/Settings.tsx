import "../styles/settings.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { api, errorMessage, type Account, type ImportCandidate, type Theme, type Thresholds } from "../lib/api";
import { fmt } from "../lib/format";
import { t, type Lang } from "../lib/i18n";
import { setQueryData, useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { RankBadge } from "../components/RankBadge";
import { HENRIK_DASHBOARD, REGIONS, tierLabel } from "../lib/assets";

type Section = "general" | "accounts" | "key" | "analysis" | "data";

const SECTIONS = (): { id: Section; label: string }[] => [
  { id: "general", label: t("Général", "General") },
  { id: "accounts", label: t("Comptes", "Accounts") },
  { id: "key", label: t("Clé API", "API key") },
  { id: "analysis", label: t("Seuils d'analyse", "Analysis thresholds") },
  { id: "data", label: t("Données", "Data") },
];

let rememberedSection: Section = "general";

type Props = {
  accounts: Account[];
  activePuuid: string | null;
  combined: boolean;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  language: Lang;
  onLanguage: (language: Lang) => void;
  notifyMatches: boolean;
  onNotifyMatches: (enabled: boolean) => void;
  onAccountsChanged: (activePuuid?: string) => void;
  onCombined: () => void;
  onReplayTour: () => void;
};

export function Settings({
  accounts,
  activePuuid,
  combined,
  theme,
  onTheme,
  language,
  onLanguage,
  notifyMatches,
  onNotifyMatches,
  onAccountsChanged,
  onCombined,
  onReplayTour,
}: Props) {
  const [key, setKey] = useState("");
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("eu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>(rememberedSection);

  const pick = (next: Section) => {
    rememberedSection = next;
    setSection(next);
  };

  const saveKey = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.saveApiKey(key);
      setKey("");
      setKeyMessage(t("Clé enregistrée.", "Key saved."));
    } catch (err) {
      setKeyMessage(errorMessage(err));
    }
  };

  const addAccount = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account = await api.addAccount(riotId, region);
      setRiotId("");
      onAccountsChanged(account.puuid);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (puuid: string) => {
    await api.setActiveAccount(puuid);
    onAccountsChanged(puuid);
  };

  const remove = async (puuid: string) => {
    await api.removeAccount(puuid);
    onAccountsChanged();
  };

  return (
    <div className="content">
      <header className="page-head">
        <h1 className="title">{t("Paramètres", "Settings")}</h1>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("Sections des paramètres", "Settings sections")}>
          {SECTIONS().map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "active" : undefined}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => pick(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-body">
          {section === "general" && (
            <>
              <div className="settings-pair">
                <section className="stack" style={{ gap: 14 }}>
                  <h2 className="section-title">{t("Apparence", "Appearance")}</h2>
                  <div className="segmented" role="group" aria-label={t("Thème", "Theme")}>
                    <button type="button" className={theme === "dark" ? "active" : undefined} onClick={() => onTheme("dark")}>
                      {t("Sombre", "Dark")}
                    </button>
                    <button type="button" className={theme === "light" ? "active" : undefined} onClick={() => onTheme("light")}>
                      {t("Clair", "Light")}
                    </button>
                  </div>
                </section>

                <section className="stack" style={{ gap: 14 }}>
                  <h2 className="section-title">{t("Langue", "Language")}</h2>
                  <div className="segmented" role="group" aria-label={t("Langue", "Language")}>
                    <button type="button" className={language === "fr" ? "active" : undefined} onClick={() => onLanguage("fr")}>
                      Français
                    </button>
                    <button type="button" className={language === "en" ? "active" : undefined} onClick={() => onLanguage("en")}>
                      English
                    </button>
                  </div>
                </section>
              </div>

              <section className="stack" style={{ gap: 14 }}>
                <h2 className="section-title">{t("Notifications", "Notifications")}</h2>
                <div className="panel settings-toggle">
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <strong id="settings-notify">{t("Notifications après chaque nouveau match", "Notify after each new match")}</strong>
                    <span className="hint">
                      {t(
                        "Une notification Windows avec la map, le score et ton K/D quand la synchro trouve un nouveau match.",
                        "A Windows notification with the map, the score and your K/D when the sync finds a new match.",
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    className="switch"
                    aria-checked={notifyMatches}
                    aria-labelledby="settings-notify"
                    onClick={() => onNotifyMatches(!notifyMatches)}
                  >
                    <span />
                  </button>
                </div>
              </section>

              <section className="stack" style={{ gap: 14 }}>
                <h2 className="section-title">{t("Aide", "Help")}</h2>
                <div className="row">
                  <button type="button" className="btn btn-secondary" onClick={onReplayTour}>
                    {t("Revoir le tutoriel", "Replay the tour")}
                  </button>
                </div>
              </section>
            </>
          )}

          {section === "key" && (
            <section className="stack" style={{ gap: 14 }}>
              <h2 className="section-title">{t("Clé API HenrikDev", "HenrikDev API key")}</h2>
              <form className="panel stack" style={{ gap: 14 }} onSubmit={saveKey}>
                <div className="field">
                  <label htmlFor="settings-key">{t("Nouvelle clé", "New key")}</label>
                  <input
                    id="settings-key"
                    className="input"
                    type="password"
                    placeholder="HDEV-xxxxxxxx-xxxx-xxxx"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span className="hint">
                    {t(
                      "La clé actuelle reste en place tant que tu n'en enregistres pas une nouvelle.",
                      "The current key stays in place until you save a new one.",
                    )}
                  </span>
                </div>
                {keyMessage && <p className="hint">{keyMessage}</p>}
                <div className="row wrap">
                  <button type="submit" className="btn btn-primary" disabled={!key.trim()}>
                    {t("Enregistrer la clé", "Save key")}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => openUrl(HENRIK_DASHBOARD)}>
                    <Icon name="external" size={16} strokeWidth={2} />
                    {t("Tableau de bord HenrikDev", "HenrikDev dashboard")}
                  </button>
                </div>
              </form>
            </section>
          )}

          {section === "accounts" && (
            <section className="stack" style={{ gap: 14 }}>
              <h2 className="section-title">{t("Comptes", "Accounts")}</h2>
              <div className="panel settings-list">
                {accounts.length > 1 && (
                  <div>
                    <span className="settings-all" aria-hidden="true">
                      <Icon name="agents" size={20} />
                    </span>
                    <span className="stack" style={{ gap: 0, flexGrow: 1 }}>
                      <strong>{t("Tous les comptes", "All accounts")}</strong>
                      <span className="faint" style={{ fontSize: 13 }}>
                        {t(
                          `Accueil et matchs de tes ${accounts.length} comptes réunis`,
                          `Home and matches from your ${accounts.length} accounts combined`,
                        )}
                      </span>
                    </span>
                    {combined ? (
                      <span className="faint" style={{ fontSize: 13 }}>
                        {t("Vue active", "Active view")}
                      </span>
                    ) : (
                      <button type="button" className="btn btn-secondary" onClick={onCombined}>
                        {t("Utiliser", "Use")}
                      </button>
                    )}
                    <span className="settings-spacer" aria-hidden="true" />
                  </div>
                )}
                {accounts.map((account) => (
                  <div key={account.puuid}>
                    <RankBadge tier={account.tier} size={40} label={tierLabel(account.tierName)} />
                    <span className="stack" style={{ gap: 0, flexGrow: 1 }}>
                      <strong>
                        {account.name} <span className="faint">#{account.tag}</span>
                      </strong>
                      <span className="faint" style={{ fontSize: 13 }}>
                        {tierLabel(account.tierName)}, {REGIONS.find((item) => item.id === account.region)?.label ?? account.region}
                      </span>
                    </span>
                    {!combined && account.puuid === activePuuid ? (
                      <span className="faint" style={{ fontSize: 13 }}>
                        {t("Compte actif", "Active account")}
                      </span>
                    ) : (
                      <button type="button" className="btn btn-secondary" onClick={() => activate(account.puuid)}>
                        {t("Utiliser", "Use")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => remove(account.puuid)}
                      aria-label={t(`Retirer ${account.name}`, `Remove ${account.name}`)}
                      title={t("Retirer ce compte", "Remove this account")}
                    >
                      <Icon name="close" size={16} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
              <form className="panel stack" style={{ gap: 14 }} onSubmit={addAccount}>
                <div className="row wrap" style={{ alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: "1 1 240px" }}>
                    <label htmlFor="settings-riot">{t("Ajouter un compte", "Add an account")}</label>
                    <input
                      id="settings-riot"
                      className="input"
                      placeholder={t("Pseudo#TAG", "Name#TAG")}
                      value={riotId}
                      onChange={(event) => setRiotId(event.target.value)}
                      spellCheck={false}
                    />
                  </div>
                  <div className="field" style={{ flex: "0 1 200px" }}>
                    <label htmlFor="settings-region">{t("Région", "Region")}</label>
                    <select id="settings-region" className="input" value={region} onChange={(event) => setRegion(event.target.value)}>
                      {REGIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={busy || !riotId.includes("#")}>
                    {busy ? t("Recherche...", "Searching...") : t("Ajouter", "Add")}
                  </button>
                </div>
                {error && <p className="form-error">{error}</p>}
              </form>
            </section>
          )}

          {section === "analysis" && <ThresholdSection />}

          {section === "data" && <DataSection />}
        </div>
      </div>
    </div>
  );
}

type ThresholdRow = {
  key: keyof Thresholds;
  label: string;
  detail: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

const thresholdRows = (): ThresholdRow[] => [
  {
    key: "tradeWindowMs",
    label: t("Fenêtre de trade", "Trade window"),
    detail: t(
      "Un coéquipier qui tue ton tueur dans ce délai après ta mort compte comme un trade.",
      "A teammate killing your killer within this time after your death counts as a trade.",
    ),
    min: 1000,
    max: 10000,
    step: 500,
    format: (value) => `${fmt(value / 1000, value % 1000 === 0 ? 0 : 1)} s`,
  },
  {
    key: "isolationMeters",
    label: t("Distance d'isolement", "Isolation distance"),
    detail: t(
      "Une mort compte comme isolée quand ton coéquipier le plus proche est plus loin que cette distance.",
      "A death counts as isolated when your nearest teammate is farther away than this distance.",
    ),
    min: 5,
    max: 40,
    step: 1,
    format: (value) => `${fmt(value)} m`,
  },
  {
    key: "fullBuy",
    label: t("Full buy", "Full buy"),
    detail: t(
      "Un round compte comme full buy quand ton équipement vaut au moins ce montant.",
      "A round counts as a full buy when your loadout is worth at least this much.",
    ),
    min: 2000,
    max: 5000,
    step: 100,
    format: (value) => t(`${fmt(value)} crédits`, `${fmt(value)} credits`),
  },
  {
    key: "sameSpot",
    label: t("Morts au même spot", "Deaths on the same spot"),
    detail: t(
      "Une zone est signalée quand tu y meurs au moins ce nombre de fois dans un même match.",
      "A zone is flagged when you die there at least this many times in one match.",
    ),
    min: 2,
    max: 6,
    step: 1,
    format: (value) => t(`${value} morts`, `${value} deaths`),
  },
];

const SAVE_DELAY = 450;

function sameThresholds(a: Thresholds, b: Thresholds) {
  return thresholdRows().every((row) => a[row.key] === b[row.key]);
}

function ThresholdSection() {
  const query = useQuery(queries.thresholds());
  const [draft, setDraft] = useState<Thresholds | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Thresholds | null>(null);
  const values = draft ?? query.data?.values ?? null;
  const defaults = query.data?.defaults ?? null;

  const change = (next: Thresholds) => {
    setDraft(next);
    setStatus(null);
    latest.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const saved = await api.setThresholds(next);
        setQueryData(queries.thresholds().key, saved);
        if (latest.current === next) {
          setDraft(null);
          setStatus(t("Seuils enregistrés. Les analyses de tes matchs en tiennent compte.", "Thresholds saved. Your match analyses now use them."));
        }
      } catch (err) {
        setStatus(errorMessage(err));
      }
    }, SAVE_DELAY);
  };

  const step = (row: ThresholdRow, direction: number) => {
    if (!values) return;
    const next = Math.min(row.max, Math.max(row.min, values[row.key] + direction * row.step));
    if (next !== values[row.key]) change({ ...values, [row.key]: next });
  };

  return (
    <section className="stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="section-title">{t("Seuils d'analyse", "Analysis thresholds")}</h2>
        <span className="hint">
          {t(
            "Ces seuils servent à détecter les défauts de chaque mort et de chaque match.",
            "These thresholds are used to detect flaws in every death and every match.",
          )}
        </span>
      </div>
      {query.error && <p className="form-error">{query.error}</p>}
      {values && (
        <div className="panel stack" style={{ gap: 18 }}>
          <div className="settings-list threshold-list">
            {thresholdRows().map((row) => (
              <div key={row.key}>
                <span className="threshold-text">
                  <strong>{row.label}</strong>
                  <span className="faint" style={{ fontSize: 13 }}>
                    {row.detail}
                  </span>
                </span>
                <span className="stepper" role="group" aria-label={row.label}>
                  <button
                    type="button"
                    onClick={() => step(row, -1)}
                    disabled={values[row.key] <= row.min}
                    aria-label={t(`Diminuer : ${row.label}`, `Decrease: ${row.label}`)}
                  >
                    <Icon name="minus" size={16} strokeWidth={2} />
                  </button>
                  <output aria-live="polite">{row.format(values[row.key])}</output>
                  <button
                    type="button"
                    onClick={() => step(row, 1)}
                    disabled={values[row.key] >= row.max}
                    aria-label={t(`Augmenter : ${row.label}`, `Increase: ${row.label}`)}
                  >
                    <Icon name="plus" size={16} strokeWidth={2} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="row wrap between">
            <span className="hint">{status}</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => defaults && change(defaults)}
              disabled={!defaults || sameThresholds(values, defaults)}
            >
              {t("Valeurs par défaut", "Reset to defaults")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

type DataStatus = { ok: boolean; message: string } | null;

function today() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function pluralEn(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function DataSection() {
  const [busy, setBusy] = useState<"export" | "pick" | "import" | null>(null);
  const [status, setStatus] = useState<DataStatus>(null);
  const [candidate, setCandidate] = useState<ImportCandidate | null>(null);

  const exportBase = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const path = await api.exportDatabase(`valtracker-${today()}.db`);
      if (path) setStatus({ ok: true, message: t(`Base exportée dans ${path}`, `Database exported to ${path}`) });
    } catch (err) {
      setStatus({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const pickBase = async () => {
    setBusy("pick");
    setStatus(null);
    setCandidate(null);
    try {
      setCandidate(await api.pickDatabaseImport());
    } catch (err) {
      setStatus({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const importBase = async () => {
    if (!candidate) return;
    setBusy("import");
    setStatus(null);
    try {
      await api.importDatabase(candidate.path);
      window.location.reload();
    } catch (err) {
      setStatus({ ok: false, message: errorMessage(err) });
      setBusy(null);
    }
  };

  return (
    <section className="stack" style={{ gap: 14 }}>
      <h2 className="section-title">{t("Données", "Data")}</h2>
      <div className="panel settings-list">
        <div>
          <span className="stack" style={{ gap: 2, flexGrow: 1, minWidth: 0 }}>
            <strong>{t("Exporter la base", "Export database")}</strong>
            <span className="hint">
              {t(
                "Une copie de tes comptes, matchs, notes et favoris dans un seul fichier.",
                "A copy of your accounts, matches, notes and favorites in a single file.",
              )}
            </span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={exportBase} disabled={busy !== null}>
            {busy === "export" ? t("Export...", "Exporting...") : t("Exporter", "Export")}
          </button>
        </div>
        <div>
          <span className="stack" style={{ gap: 2, flexGrow: 1, minWidth: 0 }}>
            <strong>{t("Importer une base", "Import a database")}</strong>
            <span className="hint">
              {t(
                "Remplace tes données locales par celles d'un fichier exporté. Ta clé API actuelle est conservée.",
                "Replaces your local data with the data from an exported file. Your current API key is kept.",
              )}
            </span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={pickBase} disabled={busy !== null}>
            {busy === "pick" ? t("Vérification...", "Checking...") : t("Choisir un fichier", "Choose a file")}
          </button>
        </div>
      </div>
      {candidate && (
        <div className="panel stack" style={{ gap: 14 }}>
          <span className="stack" style={{ gap: 4, minWidth: 0 }}>
            <strong>{t("Remplacer toutes tes données locales ?", "Replace all your local data?")}</strong>
            <span className="hint">
              {t(
                `Le fichier contient ${plural(candidate.accounts, "compte")} et ${plural(candidate.matches, "match")}. Tes comptes, matchs, notes et favoris actuels seront remplacés.`,
                `The file contains ${pluralEn(candidate.accounts, "account", "accounts")} and ${pluralEn(candidate.matches, "match", "matches")}. Your current accounts, matches, notes and favorites will be replaced.`,
              )}
            </span>
            <span className="faint ellipsis" style={{ fontSize: 12 }} title={candidate.path}>
              {candidate.path}
            </span>
          </span>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={importBase} disabled={busy !== null}>
              {busy === "import" ? t("Import...", "Importing...") : t("Remplacer", "Replace")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setCandidate(null)} disabled={busy === "import"}>
              {t("Annuler", "Cancel")}
            </button>
          </div>
        </div>
      )}
      {status && <p className={status.ok ? "hint" : "form-error"}>{status.message}</p>}
    </section>
  );
}
