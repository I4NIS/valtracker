import "../styles/agents.css";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Art, ThumbArt } from "../components/GameArt";
import { MatchList, MatchListSkeleton } from "../components/MatchList";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import { Icon } from "../components/Icon";
import { SeasonPicker } from "../components/SeasonPicker";
import { SortHeader } from "../components/SortHeader";
import type { Account } from "../lib/api";
import type { AgentMap, AgentStat } from "../lib/agents";
import type { AgentMastery } from "../lib/career";
import { agentIcon, seasonLabel } from "../lib/assets";
import { fmt, pct, playtime, roleLabel, scoreTone, signed } from "../lib/format";
import { agentArt, agentColor, useAgentCatalog, type AgentInfo } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { useBackLabel } from "../lib/navigation";
import { useQuery } from "../lib/query";
import { useSort, type SortColumns } from "../lib/sort";
import { defaultSeason, NO_FILTERS, queries } from "../lib/queries";
import { useViewport } from "../lib/viewport";
import type { GameSummary } from "../lib/api";

type Props = {
  account: Account;
  refreshKey: number;
  onOpenMatch?: (matchId: string) => void;
};

const ROLE_FILTERS = [
  { id: null, fr: "Tous", en: "All" },
  { id: "Duelist", fr: "Duelliste", en: "Duelist" },
  { id: "Initiator", fr: "Initiateur", en: "Initiator" },
  { id: "Controller", fr: "Contrôleur", en: "Controller" },
  { id: "Sentinel", fr: "Sentinelle", en: "Sentinel" },
] as const;

type RoleFilter = (typeof ROLE_FILTERS)[number]["id"];

const LARGE_WIDTH = 1700;
const MAX_RECENT = 10;
const RECENT_ROW = 56;
const MAP_ROW = 44;
const RECENT_OFFSET = 550;
const RECENT_MIN_HEIGHT = 1000;
const TREND_GAMES = 20;

const RING_BOX = 56;
const RING_CENTER = RING_BOX / 2;
const RING_STROKE = 4;
const RING_RADIUS = RING_CENTER - RING_STROKE / 2 - 1;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

const winTone = (winPct: number) => (winPct >= 50 ? "win" : "bad");

export function Agents({ account, onOpenMatch }: Props) {
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(account.puuid));
  const query = useQuery(season === undefined ? null : queries.agents(account.puuid, season));
  const masteryQuery = useQuery(queries.mastery(account.puuid));
  const masteryPending = masteryQuery.pending && masteryQuery.error === null;
  const masteries = useMemo(() => new Map((masteryQuery.data ?? []).map((item) => [item.agentId, item])), [masteryQuery.data]);
  const data = masteryPending ? null : (query.data ?? null);
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
  const viewport = useViewport();
  const large = viewport.width >= LARGE_WIDTH;
  useBackLabel(current ? t(`Retour à ${current.name}`, `Back to ${current.name}`) : null);

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
        <AgentDetail
          agent={current}
          info={catalog?.agents.get(current.agentId.toLowerCase()) ?? null}
          mastery={masteries.get(current.agentId.toLowerCase()) ?? null}
          puuid={account.puuid}
          season={season ?? null}
          onOpenMatch={onOpenMatch}
        />
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
        error ? null : <AgentsSkeleton large={large} />
      ) : data.length === 0 ? (
        <div className="empty">{t("Aucun match compétitif synchronisé sur cette période.", "No competitive matches synced for this period.")}</div>
      ) : agents.length === 0 ? (
        <div className="empty">{t("Aucun agent de ce rôle joué sur cette période.", "No agent of this role played in this period.")}</div>
      ) : (
        <div className={`agent-grid${large ? " large" : ""}`} role="group" aria-label={t("Tes agents", "Your agents")}>
          {agents.map((agent) => (
            <AgentCard
              key={agent.agentId}
              agent={agent}
              share={totalMatches ? (agent.matches * 100) / totalMatches : 0}
              info={large ? (catalog?.agents.get(agent.agentId.toLowerCase()) ?? null) : null}
              mastery={masteries.get(agent.agentId.toLowerCase()) ?? null}
              large={large}
              onSelect={() => setSelected(agent.agentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentsSkeleton({ large }: { large: boolean }) {
  return (
    <SkeletonGroup className={`agent-grid${large ? " large" : ""}`} label={t("Chargement de tes agents", "Loading your agents")}>
      {repeat(8, (index) => (
        <div className="agent-card" key={index} aria-hidden="true">
          {large && <SkeletonBlock className="agent-card-art" radius={12} />}
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <SkeletonBlock width={52} height={52} radius={14} />
            <div className="stack agent-card-name">
              <SkeletonLine width={index % 2 ? "64%" : "52%"} size={16} />
              <SkeletonLine width="40%" size={12} />
              <SkeletonLine width="34%" size={12} />
            </div>
            <SkeletonBlock width={54} height={54} radius="50%" />
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

function WinRing({ value, size }: { value: number; size: number }) {
  const tone = winTone(value);
  const share = Math.min(100, Math.max(0, value));
  return (
    <svg
      className="agent-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
      role="img"
      aria-label={t(`${fmt(value)} % de victoires`, `${fmt(value)}% win rate`)}
    >
      <circle cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" stroke="var(--line)" strokeWidth={RING_STROKE} />
      {share > 0 && (
        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke={tone === "win" ? "var(--win)" : "var(--bad)"}
          strokeWidth={RING_STROKE}
          strokeLinecap={share >= 100 ? "butt" : "round"}
          strokeDasharray={`${(share / 100) * RING_LENGTH} ${RING_LENGTH}`}
          transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
        />
      )}
      <text x={RING_CENTER} y={RING_CENTER} textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontWeight="700">
        <tspan fontSize={value >= 99.5 ? 12.5 : 14} letterSpacing="-0.3">
          {fmt(value)}
        </tspan>
        <tspan fontSize="8" fill="var(--text-2)" dx="1">
          %
        </tspan>
      </text>
    </svg>
  );
}

type CardProps = { agent: AgentStat; share: number; info: AgentInfo | null; mastery: AgentMastery | null; large: boolean; onSelect: () => void };

const masteryTitle = (level: number) => t(`Maîtrise niveau ${level}`, `Mastery level ${level}`);

function MasteryPill({ mastery }: { mastery: AgentMastery | null }) {
  if (mastery?.level === null || mastery?.level === undefined) return null;
  return (
    <span className="agent-mastery-pill" title={masteryTitle(mastery.level)} aria-label={masteryTitle(mastery.level)}>
      {t(`Niv. ${mastery.level}`, `Lv. ${mastery.level}`)}
    </span>
  );
}

function AgentCard({ agent, share, info, mastery, large, onSelect }: CardProps) {
  const tint = large ? agentColor(info, 0) : null;
  const openings = agent.firstBloods + agent.firstDeaths;
  return (
    <button
      type="button"
      className="agent-card"
      onClick={onSelect}
      aria-label={t(`Ouvrir ${agent.name}`, `Open ${agent.name}`)}
      style={tint ? ({ "--agent-tint": tint } as CSSProperties) : undefined}
    >
      {large && (
        <span className="agent-card-art">
          <ThumbArt src={agentArt(agent.agentId, "fullportrait")} width={320} height={320} alt="" />
        </span>
      )}
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        {!large && (
          <span className="agent-portrait">
            <Art src={agentIcon(agent.agentId)} width={52} height={52} alt="" />
          </span>
        )}
        <div className="stack agent-card-name">
          <span className="agent-card-title">
            <strong className="ellipsis">{agent.name}</strong>
            <MasteryPill mastery={mastery} />
          </span>
          <span className="faint">{roleLabel(agent.role) || t("Rôle inconnu", "Unknown role")}</span>
          <span className="muted agent-card-matches ellipsis" title={t(`${fmt(share)} % de tes matchs`, `${fmt(share)}% of your matches`)}>
            {matchCount(agent.matches)}
            {agent.playedMs > 0 && `, ${playtime(agent.playedMs)}`}
          </span>
        </div>
        <WinRing value={agent.winPct} size={large ? 64 : 54} />
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
        {large && (
          <>
            <div>
              <span className="label">ADR</span>
              <strong>{fmt(agent.adr)}</strong>
            </div>
            <div>
              <span className="label">{t("Ouvertures", "Openings")}</span>
              <strong className={openings ? (agent.firstBloods >= agent.firstDeaths ? "" : "bad") : "faint"}>
                {openings ? pct((agent.firstBloods * 100) / openings, 0) : "-"}
              </strong>
            </div>
            <div className="agent-card-best">
              <span className="label">{t("Meilleure map", "Best map")}</span>
              <strong className={agent.bestMap ? "ellipsis" : "faint"}>{agent.bestMap?.name ?? "-"}</strong>
            </div>
          </>
        )}
      </div>
    </button>
  );
}

const MAP_COLUMNS: SortColumns<AgentMap> = {
  map: { value: (map) => map.mapName },
  matches: { value: (map) => map.matches },
  win: { value: (map) => map.winPct },
  acs: { value: (map) => map.acs },
};

function AgentMaps({ agent }: { agent: AgentStat }) {
  const table = useSort("agent-maps", agent.maps, MAP_COLUMNS, { key: "matches", dir: "desc" });
  return (
    <div className="agent-maps">
      <div className="agent-map-row head">
        <span />
        <SortHeader table={table} column="map">{t("Carte", "Map")}</SortHeader>
        <SortHeader table={table} column="matches">{t("Matchs", "Matches")}</SortHeader>
        <SortHeader table={table} column="win">{t("Victoires", "Win rate")}</SortHeader>
        <SortHeader table={table} column="acs">ACS</SortHeader>
      </div>
      {table.rows.map((map) => (
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
  );
}

type DetailProps = {
  agent: AgentStat;
  info: AgentInfo | null;
  mastery: AgentMastery | null;
  puuid: string;
  season: string | null;
  onOpenMatch?: (matchId: string) => void;
};

function MasteryLine({ mastery }: { mastery: AgentMastery | null }) {
  if (mastery?.level === null || mastery?.level === undefined) return null;
  const tracks = mastery.tracks.filter((track) => track.name && track.level !== null);
  return (
    <span className="agent-hero-mastery">
      <strong>{masteryTitle(mastery.level)}</strong>
      {tracks.length > 1 && <span>{tracks.map((track) => `${track.name} ${track.level}`).join(", ")}</span>}
    </span>
  );
}

function AgentDetail({ agent, info, mastery, puuid, season, onOpenMatch }: DetailProps) {
  const viewport = useViewport();
  const rows = Math.min(MAX_RECENT, Math.floor((viewport.height - RECENT_OFFSET - agent.maps.length * MAP_ROW) / RECENT_ROW));
  const showRecent = viewport.height >= RECENT_MIN_HEIGHT && rows >= 3;
  const progression = useQuery(queries.progression(puuid, season)).data ?? null;
  const recent = useQuery(showRecent ? queries.recent(puuid, MAX_RECENT, 0, { ...NO_FILTERS, season, agentId: agent.agentId }) : null);
  const games = useMemo(
    () => (progression?.games ?? []).filter((game) => game.agentId?.toLowerCase() === agent.agentId.toLowerCase()).slice(-TREND_GAMES),
    [progression, agent.agentId],
  );
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
              {agent.playedMs > 0 && <>, {t(`${playtime(agent.playedMs)} de jeu`, `${playtime(agent.playedMs)} played`)}</>}
            </span>
            <MasteryLine mastery={mastery} />
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
            sub={`${fmt(agent.kills)} / ${fmt(agent.deaths)} / ${fmt(agent.assists)}`}
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

        {games.length >= 2 && <AgentTrend agent={agent} games={games} />}
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
                {t(`par round, ${fmt(agent.firstBloods)} sur ${fmt(agent.rounds)} rounds`, `per round, ${fmt(agent.firstBloods)} in ${fmt(agent.rounds)} rounds`)}
              </span>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span className="label">{t("Première mort du round", "First death")}</span>
              <span className="agent-opening-value bad">{fmt(agent.firstDeathsPerRound, 2)}</span>
              <span className="faint agent-opening-sub">
                {t(`par round, ${fmt(agent.firstDeaths)} sur ${fmt(agent.rounds)} rounds`, `per round, ${fmt(agent.firstDeaths)} in ${fmt(agent.rounds)} rounds`)}
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
          <AgentMaps agent={agent} />
        </div>

        {showRecent && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row between wrap" style={{ alignItems: "baseline" }}>
              <h3 className="agent-sub-title">{t("Derniers matchs", "Latest matches")}</h3>
              <span className="faint" style={{ fontSize: 13 }}>
                {t(`avec ${agent.name}`, `as ${agent.name}`)}
              </span>
            </div>
            {recent.data ? (
              <MatchList matches={recent.data.slice(0, rows)} sortId="agent-matches" onOpen={(matchId) => onOpenMatch?.(matchId)} />
            ) : (
              <MatchListSkeleton rows={Math.min(rows, agent.matches)} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function AgentTrend({ agent, games }: { agent: AgentStat; games: GameSummary[] }) {
  const reference = agent.lobbyAcs ?? agent.acs;
  const max = Math.max(1, reference, ...games.map((game) => game.acs)) * 1.1;
  const net = games.reduce((sum, game) => sum + (game.rrChange ?? 0), 0);
  const ranked = games.filter((game) => typeof game.rrChange === "number").length;
  return (
    <div className="stack agent-trend" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ alignItems: "baseline", gap: 8 }}>
        <h3 className="agent-sub-title">{t("ACS par match", "ACS per match")}</h3>
        <span className="faint" style={{ fontSize: 13 }}>
          {ranked > 0 && <strong className={net >= 0 ? "win" : "bad"}>{signed(net)} RR </strong>}
          {t(`sur tes ${games.length} derniers matchs`, `over your last ${games.length} matches`)}
        </span>
      </div>
      <div className="bars-chart agent-bars">
        {games.map((game) => (
          <span
            key={game.matchId}
            className={game.acs >= reference ? "up" : "down"}
            style={{ height: `${Math.max(4, (game.acs / max) * 100)}%` }}
            title={`${game.mapName ?? ""}, ${fmt(game.acs)}`}
          />
        ))}
        <i style={{ bottom: `${(reference / max) * 100}%` }} />
      </div>
      <span className="faint" style={{ fontSize: 12 }}>
        {agent.lobbyAcs !== null
          ? t(`Bleu au-dessus des autres ${agent.name} de tes lobbys (${fmt(agent.lobbyAcs)})`, `Blue above other ${agent.name} players in your lobbies (${fmt(agent.lobbyAcs)})`)
          : t(`Bleu au-dessus de ta moyenne (${fmt(agent.acs)})`, `Blue above your average (${fmt(agent.acs)})`)}
      </span>
    </div>
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
