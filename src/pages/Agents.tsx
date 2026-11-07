import "../styles/agents.css";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Art } from "../components/GameArt";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import { Icon } from "../components/Icon";
import { SeasonPicker } from "../components/SeasonPicker";
import type { Account } from "../lib/api";
import type { AgentStat } from "../lib/agents";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, pct, roleLabel, scoreTone } from "../lib/format";
import { agentArt, agentColor, useAgentCatalog, type AgentInfo } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { defaultSeason, queries } from "../lib/queries";

type Props = {
  account: Account;
  refreshKey: number;
};

const ROLE_FILTERS = [
  { id: null, fr: "Tous", en: "All" },
  { id: "Duelist", fr: "Duelliste", en: "Duelist" },
  { id: "Initiator", fr: "Initiateur", en: "Initiator" },
  { id: "Controller", fr: "Contrôleur", en: "Controller" },
  { id: "Sentinel", fr: "Sentinelle", en: "Sentinel" },
] as const;

type RoleFilter = (typeof ROLE_FILTERS)[number]["id"];

const RING_RADIUS = 20;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

const winTone = (winPct: number) => (winPct >= 50 ? "win" : "bad");

export function Agents({ account }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const query = useQuery(season === undefined ? null : queries.agents(account.puuid, season));
  const data = query.data ?? null;
  const error = query.error;
  const [role, setRole] = useState<RoleFilter>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const catalog = useAgentCatalog();

  const agents = useMemo(() => (data ?? []).filter((agent) => role === null || agent.role === role), [data, role]);
  const counts = useMemo(() => {
    const map = new Map<string | null, number>();
    (data ?? []).forEach((agent) => map.set(agent.role, (map.get(agent.role) ?? 0) + 1));
    return map;
  }, [data]);
  const current = (data ?? []).find((agent) => agent.agentId === selected) ?? null;
  const totalMatches = (data ?? []).reduce((sum, agent) => sum + agent.matches, 0);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [current?.agentId]);

  if (current) {
    return (
      <div className="content">
        <header className="page-head">
          <div className="page-head-title" style={{ alignItems: "center" }}>
            <button type="button" className="back-btn" onClick={() => setSelected(null)}>
              <Icon name="arrowRight" size={16} strokeWidth={2} className="flip" />
              {t("Tous les agents", "All agents")}
            </button>
            <span className="faint">{season ? seasonLabel(season) : t("Toutes les saisons", "All seasons")}</span>
          </div>
        </header>
        <AgentDetail agent={current} info={catalog?.agents.get(current.agentId.toLowerCase()) ?? null} />
      </div>
    );
  }

  return (
    <div className="content">
      <header className="page-head">
        <h1 className="title">Agents</h1>
        <SeasonPicker puuid={account.puuid} value={season} onChange={setSeason} />
      </header>

      <div className="section-head" style={{ alignItems: "center" }}>
        <div className="segmented agents-roles" role="group" aria-label={t("Rôle", "Role")}>
          {ROLE_FILTERS.map((filter) => {
            const count = filter.id === null ? (data?.length ?? 0) : (counts.get(filter.id) ?? 0);
            return (
              <button
                key={filter.fr}
                type="button"
                className={role === filter.id ? "active" : ""}
                onClick={() => setRole(filter.id)}
                aria-pressed={role === filter.id}
              >
                {t(filter.fr, filter.en)}
                {data && <span className="agents-role-count">{count}</span>}
              </button>
            );
          })}
        </div>
        {data && data.length > 0 && (
          <span className="faint">
            {t(
              `${data.length} agents sur ${totalMatches} matchs`,
              `${data.length} ${data.length === 1 ? "agent" : "agents"} across ${totalMatches} ${totalMatches === 1 ? "match" : "matches"}`,
            )}
          </span>
        )}
      </div>

      {error && !data && <p className="form-error">{error}</p>}

      {!data ? (
        error ? null : <AgentsSkeleton />
      ) : data.length === 0 ? (
        <div className="empty">{t("Aucun match compétitif synchronisé sur cette période.", "No competitive matches synced for this period.")}</div>
      ) : agents.length === 0 ? (
        <div className="empty">{t("Aucun agent de ce rôle joué sur cette période.", "No agent of this role played in this period.")}</div>
      ) : (
        <div className="agent-grid" role="group" aria-label={t("Tes agents", "Your agents")}>
          {agents.map((agent) => (
            <AgentCard
              key={agent.agentId}
              agent={agent}
              share={totalMatches ? (agent.matches * 100) / totalMatches : 0}
              onSelect={() => setSelected(agent.agentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentsSkeleton() {
  return (
    <SkeletonGroup className="agent-grid" label={t("Chargement de tes agents", "Loading your agents")}>
      {repeat(8, (index) => (
        <div className="agent-card" key={index} aria-hidden="true">
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <SkeletonBlock width={52} height={52} radius={14} />
            <div className="stack agent-card-name">
              <SkeletonLine width={index % 2 ? "64%" : "52%"} size={16} />
              <SkeletonLine width="40%" size={12} />
              <SkeletonLine width="34%" size={12} />
            </div>
            <SkeletonBlock width={52} height={52} radius="50%" />
          </div>
          <div className="agent-card-stats">
            {repeat(4, (stat) => (
              <div key={stat}>
                <SkeletonLine width={26} size={12} />
                <SkeletonLine width={38} size={15} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

function WinRing({ value }: { value: number }) {
  const tone = winTone(value);
  return (
    <svg className="agent-ring" width="52" height="52" viewBox="0 0 52 52" role="img" aria-label={t(`${fmt(value)} % de victoires`, `${fmt(value)}% win rate`)}>
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

function AgentCard({ agent, share, onSelect }: { agent: AgentStat; share: number; onSelect: () => void }) {
  return (
    <button type="button" className="agent-card" onClick={onSelect} aria-label={t(`Ouvrir ${agent.name}`, `Open ${agent.name}`)}>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <span className="agent-portrait">
          <Art src={agentIcon(agent.agentId)} width={52} height={52} alt="" />
        </span>
        <div className="stack agent-card-name">
          <strong className="ellipsis">{agent.name}</strong>
          <span className="faint">{roleLabel(agent.role) || t("Rôle inconnu", "Unknown role")}</span>
          <span className="muted agent-card-matches ellipsis" title={t(`${fmt(share)} % de tes matchs`, `${fmt(share)}% of your matches`)}>
            {matchCount(agent.matches)}
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

function AgentDetail({ agent, info }: { agent: AgentStat; info: AgentInfo | null }) {
  const openings = agent.firstBloods + agent.firstDeaths;
  const openingWin = openings ? (agent.firstBloods * 100) / openings : 0;
  const lobbyDelta = agent.lobbyAcs ? ((agent.acs - agent.lobbyAcs) / agent.lobbyAcs) * 100 : null;
  const tint = agentColor(info, 0);
  const abilities = (info?.abilities ?? []).filter((ability) => ability.icon && ability.slot !== "Passive");

  return (
    <section className="agent-detail" aria-label={t(`Détail ${agent.name}`, `${agent.name} details`)}>
      <div className="agent-detail-main">
        <div className="agent-hero" style={tint ? ({ "--agent-tint": tint } as CSSProperties) : undefined}>
          <Art key={`bg-${agent.agentId}`} src={agentArt(agent.agentId, "background")} width={350} height={512} alt="" className="agent-hero-word" eager />
          <Art key={`fp-${agent.agentId}`} src={agentArt(agent.agentId, "fullportrait")} width={440} height={400} alt={agent.name} className="agent-hero-portrait" eager />
          <div className="agent-hero-text">
            <span className="agent-hero-role">
              {info?.roleIcon && <Art src={info.roleIcon} width={16} height={16} alt="" className="agent-hero-role-icon" />}
              {roleLabel(agent.role) || t("Rôle inconnu", "Unknown role")}
            </span>
            <h2 className="agent-detail-name">{agent.name}</h2>
            <span className="agent-hero-meta">
              {matchCount(agent.matches)}, <span className="agent-hero-win">{agent.wins} {t("V", "W")}</span>{" "}
              <span className="agent-hero-loss">{agent.losses} {t("D", "L")}</span>, {agent.rounds} {t("rounds", agent.rounds === 1 ? "round" : "rounds")}
            </span>
            {abilities.length > 0 && (
              <ul className="agent-abilities" aria-label={t("Capacités", "Abilities")}>
                {abilities.map((ability) => (
                  <li key={ability.slot} className="agent-ability" title={ability.label}>
                    <span className="agent-ability-icon">
                      <Art src={ability.icon ?? undefined} width={28} height={28} alt="" />
                    </span>
                    <span className="agent-ability-name">{ability.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="agent-big-stats">
          <BigStat
            label={t("Victoires", "Win rate")}
            value={pct(agent.winPct, 0)}
            tone={winTone(agent.winPct)}
            sub={t(`${agent.wins} sur ${agent.matches}`, `${agent.wins} of ${agent.matches}`)}
          />
          <BigStat
            label="ACS"
            value={fmt(agent.acs)}
            tone={lobbyDelta === null ? "" : lobbyDelta >= 0 ? "good" : "bad"}
            sub={
              agent.lobbyAcs !== null
                ? t(
                    `${fmt(agent.lobbyAcs)} pour les autres ${agent.name} de tes lobbys (${agent.lobbySamples})`,
                    `${fmt(agent.lobbyAcs)} for other ${agent.name} players in your lobbies (${agent.lobbySamples})`,
                  )
                : t(`aucun autre ${agent.name} dans tes lobbys`, `no other ${agent.name} in your lobbies`)
            }
          />
          <BigStat
            label="K/D"
            value={fmt(agent.kd, 2)}
            tone={agent.kd >= 1 ? "" : "bad"}
            sub={`${agent.kills} / ${agent.deaths} / ${agent.assists}`}
          />
          <BigStat label="ADR" value={fmt(agent.adr)} sub={t("dégâts par round", "damage per round")} />
          <BigStat label="Headshot" value={pct(agent.hsPct)} sub={t("des balles touchées", "of shots that hit")} />
          <BigStat
            label={t("Score moyen", "Avg score")}
            value={agent.avgScore !== null ? `${fmt(agent.avgScore)}/100` : "-"}
            tone={agent.avgScore !== null ? scoreTone(agent.avgScore) : "faint"}
            sub={t("note de performance par match", "performance rating per match")}
          />
        </div>
      </div>

      <div className="agent-detail-side">
        <div className="agent-openings">
          <div className="row between wrap" style={{ alignItems: "baseline" }}>
            <h3 className="agent-sub-title">{t("Ouvertures", "Openings")}</h3>
            <span className="faint" style={{ fontSize: 13 }}>
              {openings
                ? t(`${pct(openingWin, 0)} des duels d'ouverture remportés`, `${pct(openingWin, 0)} of opening duels won`)
                : t("Aucun duel d'ouverture", "No opening duels")}
            </span>
          </div>
          <div className="agent-opening-grid">
            <div className="stack" style={{ gap: 2 }}>
              <span className="label">{t("Premier kill du round", "First blood")}</span>
              <span className="agent-opening-value win">{fmt(agent.firstBloodsPerRound, 2)}</span>
              <span className="faint agent-opening-sub">
                {t(`par round, ${agent.firstBloods} sur ${agent.rounds} rounds`, `per round, ${agent.firstBloods} in ${agent.rounds} rounds`)}
              </span>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span className="label">{t("Première mort du round", "First death")}</span>
              <span className="agent-opening-value bad">{fmt(agent.firstDeathsPerRound, 2)}</span>
              <span className="faint agent-opening-sub">
                {t(`par round, ${agent.firstDeaths} sur ${agent.rounds} rounds`, `per round, ${agent.firstDeaths} in ${agent.rounds} rounds`)}
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
            <h3 className="agent-sub-title">{t("Par carte", "By map")}</h3>
            <span className="faint" style={{ fontSize: 13 }}>
              {agent.bestMap
                ? t(
                    `Meilleure carte : ${agent.bestMap.name}, ${pct(agent.bestMap.winPct, 0)} sur ${agent.bestMap.matches} matchs`,
                    `Best map: ${agent.bestMap.name}, ${pct(agent.bestMap.winPct, 0)} over ${agent.bestMap.matches} ${agent.bestMap.matches === 1 ? "match" : "matches"}`,
                  )
                : t("Pas assez de matchs pour une meilleure carte", "Not enough matches for a best map")}
            </span>
          </div>
          <div className="agent-maps">
            <div className="agent-map-row head">
              <span />
              <span>{t("Carte", "Map")}</span>
              <span>{t("Matchs", "Matches")}</span>
              <span>{t("Victoires", "Win rate")}</span>
              <span>ACS</span>
            </div>
            {agent.maps.map((map) => (
              <div key={map.mapName} className={`agent-map-row${agent.bestMap?.name === map.mapName ? " best" : ""}`}>
                <span className="agent-map-thumb">
                  <Art src={map.image ?? undefined} width={72} height={36} alt="" />
                </span>
                <strong className="ellipsis">{map.mapName}</strong>
                <span className="muted">
                  {map.matches}
                  <span className="faint">
                    {" "}
                    {t(`(${map.wins} V, ${map.matches - map.wins} D)`, `(${map.wins} W, ${map.matches - map.wins} L)`)}
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
