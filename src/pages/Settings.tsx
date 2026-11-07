import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { api, errorMessage, type Account, type ImportCandidate, type Theme } from "../lib/api";
import { RankBadge } from "../components/RankBadge";
import { HENRIK_DASHBOARD, REGIONS, tierLabel } from "../lib/assets";

type Props = {
  accounts: Account[];
  activePuuid: string | null;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  notifyMatches: boolean;
  onNotifyMatches: (enabled: boolean) => void;
  onAccountsChanged: (activePuuid?: string) => void;
  onReplayTour: () => void;
};

export function Settings({ accounts, activePuuid, theme, onTheme, notifyMatches, onNotifyMatches, onAccountsChanged, onReplayTour }: Props) {
  const [key, setKey] = useState("");
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("eu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveKey = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.saveApiKey(key);
      setKey("");
      setKeyMessage("Clé enregistrée.");
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
      <h1 className="title">Paramètres</h1>

      <section className="stack" style={{ gap: 14 }}>
        <h2 className="section-title">Apparence</h2>
        <div className="segmented" role="group" aria-label="Thème">
          <button type="button" className={theme === "dark" ? "active" : undefined} onClick={() => onTheme("dark")}>
            Sombre
          </button>
          <button type="button" className={theme === "light" ? "active" : undefined} onClick={() => onTheme("light")}>
            Clair
          </button>
        </div>
      </section>

      <section className="stack" style={{ gap: 14 }}>
        <h2 className="section-title">Notifications</h2>
        <div className="panel settings-toggle">
          <span className="stack" style={{ gap: 2, minWidth: 0 }}>
            <strong id="settings-notify">Notifications après chaque nouveau match</strong>
            <span className="hint">Une notification Windows avec la map, le score et ton K/D quand la synchro trouve un nouveau match.</span>
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
        <h2 className="section-title">Clé API HenrikDev</h2>
        <form className="panel stack" style={{ gap: 14 }} onSubmit={saveKey}>
          <div className="field">
            <label htmlFor="settings-key">Nouvelle clé</label>
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
            <span className="hint">La clé actuelle reste en place tant que tu n'en enregistres pas une nouvelle.</span>
          </div>
          {keyMessage && <p className="hint">{keyMessage}</p>}
          <div className="row wrap">
            <button type="submit" className="btn btn-primary" disabled={!key.trim()}>
              Enregistrer la clé
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => openUrl(HENRIK_DASHBOARD)}>
              <Icon name="external" size={16} strokeWidth={2} />
              Tableau de bord HenrikDev
            </button>
          </div>
        </form>
      </section>

      <section className="stack" style={{ gap: 14 }}>
        <h2 className="section-title">Comptes</h2>
        <div className="panel settings-list">
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
              {account.puuid === activePuuid ? (
                <span className="faint" style={{ fontSize: 13 }}>
                  Compte actif
                </span>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => activate(account.puuid)}>
                  Utiliser
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                onClick={() => remove(account.puuid)}
                aria-label={`Retirer ${account.name}`}
                title="Retirer ce compte"
              >
                <Icon name="close" size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
        <form className="panel stack" style={{ gap: 14 }} onSubmit={addAccount}>
          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 240px" }}>
              <label htmlFor="settings-riot">Ajouter un compte</label>
              <input
                id="settings-riot"
                className="input"
                placeholder="Pseudo#TAG"
                value={riotId}
                onChange={(event) => setRiotId(event.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="field" style={{ flex: "0 1 200px" }}>
              <label htmlFor="settings-region">Région</label>
              <select id="settings-region" className="input" value={region} onChange={(event) => setRegion(event.target.value)}>
                {REGIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !riotId.includes("#")}>
              {busy ? "Recherche..." : "Ajouter"}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      </section>

      <DataSection />

      <section className="stack" style={{ gap: 14 }}>
        <h2 className="section-title">Aide</h2>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={onReplayTour}>
            Revoir le tutoriel
          </button>
        </div>
      </section>
    </div>
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

function DataSection() {
  const [busy, setBusy] = useState<"export" | "pick" | "import" | null>(null);
  const [status, setStatus] = useState<DataStatus>(null);
  const [candidate, setCandidate] = useState<ImportCandidate | null>(null);

  const exportBase = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const path = await api.exportDatabase(`valtracker-${today()}.db`);
      if (path) setStatus({ ok: true, message: `Base exportée dans ${path}` });
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
      <h2 className="section-title">Données</h2>
      <div className="panel settings-list">
        <div>
          <span className="stack" style={{ gap: 2, flexGrow: 1, minWidth: 0 }}>
            <strong>Exporter la base</strong>
            <span className="hint">Une copie de tes comptes, matchs, notes et favoris dans un seul fichier.</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={exportBase} disabled={busy !== null}>
            {busy === "export" ? "Export..." : "Exporter"}
          </button>
        </div>
        <div>
          <span className="stack" style={{ gap: 2, flexGrow: 1, minWidth: 0 }}>
            <strong>Importer une base</strong>
            <span className="hint">Remplace tes données locales par celles d'un fichier exporté. Ta clé API actuelle est conservée.</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={pickBase} disabled={busy !== null}>
            {busy === "pick" ? "Vérification..." : "Choisir un fichier"}
          </button>
        </div>
      </div>
      {candidate && (
        <div className="panel stack" style={{ gap: 14 }}>
          <span className="stack" style={{ gap: 4, minWidth: 0 }}>
            <strong>Remplacer toutes tes données locales ?</strong>
            <span className="hint">
              Le fichier contient {plural(candidate.accounts, "compte")} et {plural(candidate.matches, "match")}. Tes comptes, matchs, notes
              et favoris actuels seront remplacés.
            </span>
            <span className="faint ellipsis" style={{ fontSize: 12 }} title={candidate.path}>
              {candidate.path}
            </span>
          </span>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={importBase} disabled={busy !== null}>
              {busy === "import" ? "Import..." : "Remplacer"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setCandidate(null)} disabled={busy === "import"}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {status && <p className={status.ok ? "hint" : "form-error"}>{status.message}</p>}
    </section>
  );
}
