import "../styles/agents.css";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { SeasonPicker } from "../components/SeasonPicker";
import { errorMessage, type Account } from "../lib/api";
import { getAgentStats, type AgentStat } from "../lib/agents";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, pct, roleLabel, scoreTone } from "../lib/format";

type Props = {
  account: Account;
  refreshKey: number;
};

const ROLE_FILTERS = [
  { id: null, label: "Tous" },
  { id: "Duelist", label: "Duelliste" },
  { id: "Initiator", label: "Initiateur" },
  { id: "Controller", label: "Contrôleur" },
  { id: "Sentinel", label: "Sentinelle" },
] as const;

type RoleFilter = (typeof ROLE_FILTERS)[number]["id"];

const RING_RADIUS = 20;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const winTone = (winPct: number) => (winPct >= 50 ? "win" : "bad");

export function Agents({ account, refreshKey }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<AgentStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<RoleFilter>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (season === undefined) return;
    let active = true;
    setError(null);
    getAgentStats(account.puuid, season)
      .then((list) => {
        if (active) setData(list);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [account.puuid, season, refreshKey]);

  const agents = useMemo(() => (data ?? []).filter((agent) => role === null || agent.role === role), [data, role]);
  const counts = useMemo(() => {
    const map = new Map<string | null, number>();
    (data ?? []).forEach((agent) => map.set(agent.role, (map.get(agent.role) ?? 0) + 1));
    return map;
  }, [data]);
  const current = agents.find((agent) => agent.agentId === selected) ?? agents[0] ?? null;
  const totalMatches = (data ?? []).reduce((sum, agent) => sum + agent.matches, 0);

  const select = (agentId: string) => {
    setSelected(agentId);
  };

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{season ? seasonLabel(season) : "Toutes les saisons"}</span>
        <h1 className="title">Agents</h1>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />
        <div className="segmented agents-roles" role="group" aria-label="Rôle">
          {ROLE_FILTERS.map((filter) => {
            const count = filter.id === null ? (data?.length ?? 0) : (counts.get(filter.id) ?? 0);
            return (
              <button
                key={filter.label}
                type="button"
                className={role === filter.id ? "active" : ""}
                onClick={() => setRole(filter.id)}
                aria-pressed={role === filter.id}
              >
                {filter.label}
                {data && <span className="agents-role-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {!data ? (
        <div className="empty">Chargement de tes agents...</div>
      ) : data.length === 0 ? (
        <div className="empty">Aucun match compétitif synchronisé sur cette période.</div>
      ) : agents.length === 0 ? (
        <div className="empty">Aucun agent de ce rôle joué sur cette période.</div>
      ) : (
        <>
          <section className="stack" style={{ gap: 16 }}>
            <div className="row between wrap">
              <h2 className="section-title">Tes agents</h2>
              <span className="faint" style={{ fontSize: 13 }}>
                {data.length} agents sur {totalMatches} matchs
              </span>
            </div>
            <div className="agent-grid">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.agentId}
                  agent={agent}
                  share={totalMatches ? (agent.matches * 100) / totalMatches : 0}
                  active={current?.agentId === agent.agentId}
                  onSelect={() => select(agent.agentId)}
                />
              ))}
            </div>
          </section>

          {current && <AgentDetail ref={detailRef} agent={current} />}
        </>
      )}
    </div>
  );
}

function WinRing({ value }: { value: number }) {
  const tone = winTone(value);
  return (
    <svg className="agent-ring" width="52" height="52" viewBox="0 0 52 52" role="img" aria-label={`${fmt(value)} % de victoires`}>
      <circle cx="26" cy="26" r={RING_RADIUS} fill="none" stroke="var(--field)" strokeWidth="5" />
      <circle
        cx="26"
        cy="26"
        r={RING_RADIUS}
        fill="none"
        stroke={tone === "win" ? "var(--win)" : "var(--bad)"}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, Math.max(0, value)) / 100) * RING_LENGTH} ${RING_LENGTH}`}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="30" textAnchor="middle" fill="var(--text)" fontSize="12" fontWeight="700">
        {fmt(value)}%
      </text>
    </svg>
  );
}

function AgentCard({ agent, share, active, onSelect }: { agent: AgentStat; share: number; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`agent-card${active ? " active" : ""}`} onClick={onSelect} aria-pressed={active}>
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        <span className="agent-portrait">{agentIcon(agent.agentId) && <img src={agentIcon(agent.agentId)} alt="" />}</span>
        <div className="stack agent-card-name">
          <strong className="ellipsis">{agent.name}</strong>
          <span className="faint">{roleLabel(agent.role) || "Rôle inconnu"}</span>
          <span className="muted agent-card-matches ellipsis" title={`${fmt(share)} % de tes matchs`}>
            {agent.matches} {agent.matches > 1 ? "matchs" : "match"}
          </span>
        </div>
        <WinRing value={agent.winPct} />
      </div>
      <div className="agent-card-stats">
        <div>
          <span className="label">K/D</span>
          <strong className={agent.kd >= 1 ? "" : "bad"}>{fmt(agent.kd, 2)}</strong>
        </div>
        <div>
          <span className="label">ACS</span>
          <strong className={agent.lobbyAcs !== null ? (agent.acs >= agent.lobbyAcs ? "good" : "bad") : ""}>{fmt(agent.acs)}</strong>
        </div>
        <div>
          <span className="label">HS</span>
          <strong>{pct(agent.hsPct, 0)}</strong>
        </div>
        <div>
          <span className="label">Score</span>
          {agent.avgScore !== null ? (
            <strong className={scoreTone(agent.avgScore)}>
              {fmt(agent.avgScore)}
              <small>/100</small>
            </strong>
          ) : (
            <strong className="faint">-</strong>
          )}
        </div>
      </div>
    </button>
  );
}

function AgentDetail({ agent, ref }: { agent: AgentStat; ref: Ref<HTMLElement> }) {
  const openings = agent.firstBloods + agent.firstDeaths;
  const openingWin = openings ? (agent.firstBloods * 100) / openings : 0;
  const lobbyDelta = agent.lobbyAcs ? ((agent.acs - agent.lobbyAcs) / agent.lobbyAcs) * 100 : null;
  const icon = agentIcon(agent.agentId);

  return (
    <section ref={ref} className="panel agent-detail" aria-label={`Détail ${agent.name}`}>
      <div className="agent-detail-head">
        <span className="agent-portrait large">{icon && <img src={icon} alt="" />}</span>
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <span className="eyebrow">{roleLabel(agent.role) || "Rôle inconnu"}</span>
          <h2 className="agent-detail-name">{agent.name}</h2>
          <span className="muted">
            {agent.matches} {agent.matches > 1 ? "matchs" : "match"}, <span className="win">{agent.wins} V</span>{" "}
            <span className="bad">{agent.losses} D</span>, {agent.rounds} rounds
          </span>
        </div>
      </div>

      <div className="agent-big-stats">
        <BigStat label="Victoires" value={pct(agent.winPct, 0)} tone={winTone(agent.winPct)} sub={`${agent.wins} sur ${agent.matches}`} />
        <BigStat
          label="ACS"
          value={fmt(agent.acs)}
          tone={lobbyDelta === null ? "" : lobbyDelta >= 0 ? "good" : "bad"}
          sub={
            agent.lobbyAcs !== null
              ? `${fmt(agent.lobbyAcs)} pour les autres ${agent.name} de tes lobbys (${agent.lobbySamples})`
              : `aucun autre ${agent.name} dans tes lobbys`
          }
        />
        <BigStat
          label="K/D"
          value={fmt(agent.kd, 2)}
          tone={agent.kd >= 1 ? "" : "bad"}
          sub={`${agent.kills} / ${agent.deaths} / ${agent.assists}`}
        />
        <BigStat label="ADR" value={fmt(agent.adr)} sub="dégâts par round" />
        <BigStat label="Headshot" value={pct(agent.hsPct)} sub="des balles touchées" />
        <BigStat
          label="Score moyen"
          value={agent.avgScore !== null ? `${fmt(agent.avgScore)}/100` : "-"}
          tone={agent.avgScore !== null ? scoreTone(agent.avgScore) : "faint"}
          sub="note de performance par match"
        />
      </div>

      <div className="agent-openings">
        <div className="row between wrap" style={{ alignItems: "baseline" }}>
          <h3 className="agent-sub-title">Ouvertures</h3>
          <span className="faint" style={{ fontSize: 13 }}>
            {openings ? `${pct(openingWin, 0)} des duels d'ouverture remportés` : "Aucun duel d'ouverture"}
          </span>
        </div>
        <div className="agent-opening-grid">
          <div className="stack" style={{ gap: 2 }}>
            <span className="label">Premier kill du round</span>
            <span className="agent-opening-value win">{fmt(agent.firstBloodsPerRound, 2)}</span>
            <span className="faint agent-opening-sub">
              par round, {agent.firstBloods} sur {agent.rounds} rounds
            </span>
          </div>
          <div className="stack" style={{ gap: 2 }}>
            <span className="label">Première mort du round</span>
            <span className="agent-opening-value bad">{fmt(agent.firstDeathsPerRound, 2)}</span>
            <span className="faint agent-opening-sub">
              par round, {agent.firstDeaths} sur {agent.rounds} rounds
            </span>
          </div>
        </div>
        {openings > 0 && (
          <div className="agent-split" aria-hidden="true">
            <span className="fb" style={{ flexGrow: agent.firstBloods }} />
            <span className="fd" style={{ flexGrow: agent.firstDeaths }} />
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <div className="row between wrap" style={{ alignItems: "baseline" }}>
          <h3 className="agent-sub-title">Par carte</h3>
          <span className="faint" style={{ fontSize: 13 }}>
            {agent.bestMap
              ? `Meilleure carte : ${agent.bestMap.name}, ${pct(agent.bestMap.winPct, 0)} sur ${agent.bestMap.matches} matchs`
              : "Pas assez de matchs pour une meilleure carte"}
          </span>
        </div>
        <div className="agent-maps">
          <div className="agent-map-row head">
            <span />
            <span>Carte</span>
            <span>Matchs</span>
            <span>Victoires</span>
            <span>ACS</span>
          </div>
          {agent.maps.map((map) => (
            <div key={map.mapName} className={`agent-map-row${agent.bestMap?.name === map.mapName ? " best" : ""}`}>
              <span className="agent-map-thumb">{map.image && <img src={map.image} alt="" />}</span>
              <strong className="ellipsis">{map.mapName}</strong>
              <span className="muted">
                {map.matches}
                <span className="faint">
                  {" "}
                  ({map.wins} V, {map.matches - map.wins} D)
                </span>
              </span>
              <div className="agent-map-win">
                <div className="agent-winbar">
                  <span className={winTone(map.winPct)} style={{ width: `${Math.max(map.winPct, 2)}%` }} />
                </div>
                <span className={winTone(map.winPct)}>{pct(map.winPct, 0)}</span>
              </div>
              <span className={agent.lobbyAcs !== null ? (map.acs >= agent.lobbyAcs ? "good" : "bad") : ""}>{fmt(map.acs)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BigStat({ label, value, sub, tone = "" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="label">{label}</span>
      <span className={`agent-big-value ${tone}`}>{value}</span>
      <span className="faint agent-big-sub">{sub}</span>
    </div>
  );
}
