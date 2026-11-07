import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { api, errorMessage, type Account, type Theme } from "../lib/api";
import { HENRIK_DASHBOARD, REGIONS, tierIcon, tierLabel } from "../lib/assets";

type Props = {
  accounts: Account[];
  activePuuid: string | null;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onAccountsChanged: (activePuuid?: string) => void;
  onReplayTour: () => void;
};

export function Settings({ accounts, activePuuid, theme, onTheme, onAccountsChanged, onReplayTour }: Props) {
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
              <img src={tierIcon(account.tier)} alt="" />
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
