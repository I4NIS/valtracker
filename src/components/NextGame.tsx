import "../styles/nextgame.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { agentIcon } from "../lib/assets";
import { fmt, pct } from "../lib/format";
import { useAgentCatalog, type Catalog } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { buildReport, getNextGame, MIN_SAMPLE, PARTY_LABELS, partyLabel, pickOptions, tierGap, winShare, type PastGame, type Rate } from "../lib/nextGame";
import { useQuery } from "../lib/query";
import { MIN_GAMES, trainWinModel, type Effect, type Inputs, type WinModel } from "../lib/winModel";
import { whenIdle } from "../lib/idle";
import { Icon } from "./Icon";

const ANY = "";
const MAX_ALLIES = 4;
const MAX_ENEMIES = 5;

const SESSION_GAP_MS = 2 * 3600 * 1000;

const remembered = { touched: false, mapId: ANY, agentId: ANY, party: 1, allies: [] as string[], enemies: [] as string[] };

function defaultInputs(history: PastGame[]): Inputs {
  const last = [...history].reverse().find((game) => !game.draw);
  const inSession = last !== undefined && Date.now() - new Date(last.startedAt).getTime() < SESSION_GAP_MS;
  return { mapId: null, agentId: last?.agentId?.toLowerCase() ?? null, party: inSession ? last.party : 1, allies: [], enemies: [] };
}

function currentInputs(history: PastGame[]): Inputs {
  if (!remembered.touched) return defaultInputs(history);
  return { mapId: remembered.mapId || null, agentId: remembered.agentId || null, party: remembered.party, allies: remembered.allies, enemies: remembered.enemies };
}

const trainedModels = new WeakMap<PastGame[], WinModel | null>();

const points = (delta: number) => {
  const size = Math.round(Math.abs(delta));
  return `${delta > 0 ? "+" : "-"}${fmt(size, 0)} ${size > 1 ? "pts" : "pt"}`;
};

const record = (rate: Rate) => t(`${rate.wins} V ${rate.losses} D`, `${rate.wins} W ${rate.losses} L`);

export function NextGameButton({ puuid }: { puuid: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ key: `nextGame|${puuid}`, fetch: () => getNextGame(puuid) });
  const history = query.data ?? null;
  const catalog = useAgentCatalog();
  const { model } = useWinModel(history, catalog);
  const inputs = history ? currentInputs(history) : null;
  const probability = model && inputs ? model.predict(inputs).probability : null;
  const agent = inputs?.agentId ? (catalog?.agents.get(inputs.agentId)?.name ?? "") : "";
  const hint = inputs
    ? t(
        `Chance de victoire estimée ${agent ? `avec ${agent}, ` : ""}${partyLabel(inputs.party).toLowerCase()}, sans map choisie. Clique pour changer les choix.`,
        `Estimated chance to win ${agent ? `with ${agent}, ` : ""}${partyLabel(inputs.party).toLowerCase()}, no map picked. Click to change the choices.`,
      )
    : undefined;
  return (
    <>
      <button type="button" className="btn btn-secondary nextgame-button" onClick={() => setOpen(true)} title={hint}>
        {t("Prochaine game", "Next game")}
        {probability !== null && <span className={`nextgame-badge ${probability >= 0.5 ? "good" : "bad"}`}>{pct(probability * 100, 0)}</span>}
      </button>
      {open && <NextGameDialog puuid={puuid} onClose={() => setOpen(false)} />}
    </>
  );
}

function useWinModel(history: PastGame[] | null, catalog: Catalog | null): { model: WinModel | null; ready: boolean } {
  const [state, setState] = useState<{ model: WinModel | null; ready: boolean }>({ model: null, ready: false });
  useEffect(() => {
    if (!history || !catalog) return;
    if (trainedModels.has(history)) {
      setState({ model: trainedModels.get(history) ?? null, ready: true });
      return;
    }
    setState({ model: null, ready: false });
    let cancelled = false;
    whenIdle().then(() => {
      if (cancelled) return;
      const model = trainedModels.has(history)
        ? (trainedModels.get(history) ?? null)
        : trainWinModel(history, (agent) => catalog.agents.get(agent.toLowerCase())?.role ?? null);
      trainedModels.set(history, model);
      if (!cancelled) setState({ model, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, [history, catalog]);
  return state;
}

function NextGameDialog({ puuid, onClose }: { puuid: string; onClose: () => void }) {
  const query = useQuery({ key: `nextGame|${puuid}`, fetch: () => getNextGame(puuid) });
  const history = query.data ?? null;
  const catalog = useAgentCatalog();
  const start = history ? currentInputs(history) : null;
  const [mapId, setMapId] = useState(start?.mapId ?? ANY);
  const [agentId, setAgentId] = useState(start?.agentId ?? ANY);
  const [party, setParty] = useState(start?.party ?? 1);
  const [allies, setAllies] = useState<string[]>(start?.allies ?? []);
  const [enemies, setEnemies] = useState<string[]>(start?.enemies ?? []);
  const changed = useRef(false);
  const [picking, setPicking] = useState<"allies" | "enemies" | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => (history ? pickOptions(history) : { maps: [], agents: [] }), [history]);
  const report = useMemo(() => (history ? buildReport(history, mapId || null, agentId || null, party, new Date()) : null), [history, mapId, agentId, party]);
  const { model, ready } = useWinModel(history, catalog);

  useEffect(() => {
    if (!changed.current) {
      changed.current = true;
      return;
    }
    Object.assign(remembered, { touched: true, mapId, agentId, party, allies, enemies });
  }, [mapId, agentId, party, allies, enemies]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputs: Inputs = { mapId: mapId || null, agentId: agentId || null, party, allies, enemies };
  const prediction = model ? model.predict(inputs) : null;
  const overall = report ? winShare(report.overall) : null;
  const agentName = (id: string) => catalog?.agents.get(id.toLowerCase())?.name ?? options.agents.find((agent) => agent.id === id)?.name ?? id;
  const mapName = options.maps.find((map) => map.id === mapId)?.name ?? "";
  const total = history ? history.filter((game) => !game.draw).length : 0;

  const effectLabel = (effect: Effect): string => {
    const roleCount = (list: string[], role: string) => list.filter((entry) => catalog?.agents.get(entry.toLowerCase())?.role === role).length;
    const mine = agentId ? [agentId, ...allies] : allies;
    switch (effect.key) {
      case "map":
        return t(`Sur ${mapName}`, `On ${mapName}`);
      case "agent":
        return t(`Avec ${agentName(agentId)}`, `With ${agentName(agentId)}`);
      case "mapAgent":
        return t(`${agentName(agentId)} sur ${mapName}`, `${agentName(agentId)} on ${mapName}`);
      case "party":
        return partyLabel(party);
      case "allies":
        return t(`Tes alliés : ${allies.map(agentName).join(", ")}`, `Your teammates: ${allies.map(agentName).join(", ")}`);
      case "enemies":
        return t(`En face : ${enemies.map(agentName).join(", ")}`, `Against: ${enemies.map(agentName).join(", ")}`);
      case "controllers":
        return t(`Contrôleurs : ${roleCount(mine, "Controller")} de ton côté, ${roleCount(enemies, "Controller")} en face`, `Controllers: ${roleCount(mine, "Controller")} on your side, ${roleCount(enemies, "Controller")} against`);
      case "duelists":
        return t(`Duellistes : ${roleCount(mine, "Duelist")} de ton côté, ${roleCount(enemies, "Duelist")} en face`, `Duelists: ${roleCount(mine, "Duelist")} on your side, ${roleCount(enemies, "Duelist")} against`);
      case "noController":
        return t("Aucun contrôleur dans ton équipe", "No controller on your team");
    }
  };

  return createPortal(
    <div className="nextgame-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="nextgame-dialog" role="dialog" aria-modal="true" aria-labelledby="nextgame-title" tabIndex={-1} ref={dialogRef}>
        <header className="nextgame-head">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="nextgame-title" className="nextgame-title">
              {t("Prochaine game", "Next game")}
            </h2>
            <span className="faint">{t("Tout est facultatif, chaque choix met le résultat à jour.", "Everything is optional, each choice updates the result.")}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Fermer", "Close")}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="nextgame-picks">
          <label className="stack" style={{ gap: 4 }}>
            <span className="label">{t("Map", "Map")}</span>
            <select className="input" value={mapId} onChange={(event) => setMapId(event.target.value)}>
              <option value={ANY}>{t("Peu importe", "Any map")}</option>
              {options.maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="label">{t("Ton agent", "Your agent")}</span>
            <select className="input" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              <option value={ANY}>{t("Peu importe", "Any agent")}</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <div className="stack nextgame-wide" style={{ gap: 4 }}>
            <span className="label">{t("Groupe", "Group")}</span>
            <div className="segmented" role="group" aria-label={t("Taille du groupe", "Group size")}>
              {PARTY_LABELS().map((label, index) => (
                <button key={label} type="button" className={party === index + 1 ? "active" : undefined} onClick={() => setParty(index + 1)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <AgentSlots
            label={t("Agents alliés", "Allied agents")}
            chosen={allies}
            max={MAX_ALLIES}
            catalog={catalog}
            exclude={agentId ? [agentId, ...allies] : allies}
            open={picking === "allies"}
            onToggle={() => setPicking(picking === "allies" ? null : "allies")}
            onChange={setAllies}
          />
          <AgentSlots
            label={t("Agents en face", "Enemy agents")}
            chosen={enemies}
            max={MAX_ENEMIES}
            catalog={catalog}
            exclude={enemies}
            open={picking === "enemies"}
            onToggle={() => setPicking(picking === "enemies" ? null : "enemies")}
            onChange={setEnemies}
          />
        </div>

        <div className="nextgame-body">
          {query.error && !history && <p className="form-error">{query.error}</p>}
          {!history && !query.error && <span className="faint">{t("Chargement de tes matchs", "Loading your matches")}</span>}

          {history && total < MIN_GAMES && (
            <span className="faint">
              {t(`Le modèle a besoin de ${MIN_GAMES} matchs enregistrés, tu en as ${total}.`, `The model needs ${MIN_GAMES} recorded matches, you have ${total}.`)}
            </span>
          )}
          {history && total >= MIN_GAMES && !ready && <span className="faint">{t("Entraînement du modèle sur tes matchs", "Training the model on your matches")}</span>}

          {prediction && model && (
            <section className="nextgame-chance">
              <div className="nextgame-chance-head">
                <span className="label">{t("Chance de victoire estimée", "Estimated chance to win")}</span>
                <strong className={prediction.probability >= 0.5 ? "good" : "bad"}>{pct(prediction.probability * 100, 0)}</strong>
              </div>
              {model.reliability && (
                <p className="faint nextgame-note">
                  {t(
                    `Rejoué sur tes ${model.reliability.tests} derniers matchs, ce modèle a vu juste ${model.reliability.correct} fois (${pct((model.reliability.correct * 100) / model.reliability.tests, 0)}). En disant toujours « victoire », on a juste ${model.reliability.always} fois (${pct((model.reliability.always * 100) / model.reliability.tests, 0)}).`,
                    `Replayed over your last ${model.reliability.tests} matches, this model was right ${model.reliability.correct} times (${pct((model.reliability.correct * 100) / model.reliability.tests, 0)}). Always saying "win" is right ${model.reliability.always} times (${pct((model.reliability.always * 100) / model.reliability.tests, 0)}).`,
                  )}
                </p>
              )}
              {prediction.effects.length > 0 && (
                <ul className="nextgame-effects">
                  {prediction.effects.map((effect) => (
                    <li key={effect.key}>
                      <span className="ellipsis">{effectLabel(effect)}</span>
                      <strong className={effect.points > 0 ? "good" : "bad"}>{points(effect.points)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {report && overall !== null && (
            <>
              <div className="nextgame-overall">
                <span className="label">{t("Tes conditions, sur tous tes matchs enregistrés", "Your conditions, across all your recorded matches")}</span>
                <strong>{pct(overall, 0)}</strong>
                <span className="faint">{record(report.overall)}</span>
              </div>
              <ul className="nextgame-list">
                {report.conditions.map((condition) => {
                  const share = winShare(condition.rate);
                  const count = condition.rate.wins + condition.rate.losses;
                  const enough = share !== null && count >= MIN_SAMPLE;
                  const delta = enough ? share - overall : null;
                  return (
                    <li className="nextgame-row" key={condition.key}>
                      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <strong>{condition.title}</strong>
                        <span className="faint">{condition.detail}</span>
                      </div>
                      <div className="nextgame-value">
                        {enough ? (
                          <>
                            <strong className={delta !== null && Math.abs(delta) >= 1 ? (delta > 0 ? "good" : "bad") : undefined}>{pct(share, 0)}</strong>
                            <span className="faint">
                              {record(condition.rate)}
                              {delta !== null && Math.abs(delta) >= 1 && `, ${points(delta)}`}
                            </span>
                          </>
                        ) : (
                          <span className="faint">
                            {count === 0
                              ? t("Aucun match", "No match")
                              : t(`${count} match${count > 1 ? "s" : ""}, pas assez pour un taux`, `${count} ${count === 1 ? "match" : "matches"}, not enough for a rate`)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="faint nextgame-note">
                {report.lobby.allies !== null || report.lobby.enemies !== null
                  ? t(
                      `Sur tes ${report.lobby.games} derniers matchs, tes alliés étaient en moyenne ${tierGap(report.lobby.allies)} et tes adversaires ${tierGap(report.lobby.enemies)}.`,
                      `Over your last ${report.lobby.games} matches, your teammates were on average ${tierGap(report.lobby.allies)} and your opponents ${tierGap(report.lobby.enemies)}.`,
                    )
                  : ""}
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

type SlotsProps = {
  label: string;
  chosen: string[];
  max: number;
  catalog: Catalog | null;
  exclude: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (next: string[]) => void;
};

function AgentSlots({ label, chosen, max, catalog, exclude, open, onToggle, onChange }: SlotsProps) {
  const all = useMemo(() => [...(catalog?.agents.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [catalog]);
  const excluded = new Set(exclude.map((id) => id.toLowerCase()));
  const nameOf = (id: string) => catalog?.agents.get(id.toLowerCase())?.name ?? id;
  return (
    <div className="stack nextgame-wide" style={{ gap: 6 }}>
      <span className="label">
        {label} <span className="faint">{t(`${chosen.length} sur ${max}`, `${chosen.length} of ${max}`)}</span>
      </span>
      <div className="nextgame-slots">
        {chosen.map((id) => (
          <button key={id} type="button" className="nextgame-slot" onClick={() => onChange(chosen.filter((entry) => entry !== id))} aria-label={t(`Retirer ${nameOf(id)}`, `Remove ${nameOf(id)}`)}>
            {agentIcon(id) && <img src={agentIcon(id)} alt="" width={22} height={22} />}
            <span>{nameOf(id)}</span>
            <Icon name="close" size={12} />
          </button>
        ))}
        {chosen.length < max && (
          <button type="button" className="nextgame-slot add" onClick={onToggle} aria-expanded={open}>
            {t("Ajouter", "Add")}
          </button>
        )}
      </div>
      {open && chosen.length < max && (
        <div className="nextgame-grid" role="listbox" aria-label={label}>
          {all
            .filter((agent) => !excluded.has(agent.id.toLowerCase()))
            .map((agent) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={false}
                className="nextgame-pick"
                title={agent.name}
                onClick={() => {
                  const next = [...chosen, agent.id.toLowerCase()];
                  onChange(next);
                  if (next.length >= max) onToggle();
                }}
              >
                {agentIcon(agent.id) && <img src={agentIcon(agent.id)} alt="" width={34} height={34} loading="lazy" />}
                <span className="ellipsis">{agent.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
