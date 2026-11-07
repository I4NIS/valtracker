import "../styles/home.css";
import { useEffect, useState } from "react";
import { ExportRecapButton } from "../components/ExportRecap";
import { FilterPill, type PillOption } from "../components/FilterPill";
import { Icon } from "../components/Icon";
import { MatchList } from "../components/MatchList";
import { RankBadge } from "../components/RankBadge";
import type { Account, OverviewFilters, Party, RecentMatch } from "../lib/api";
import { agentIcon, seasonLabel, tierLabel } from "../lib/assets";
import { fmt, greeting, pct, roleLabel, signed, timeAgo, tradeWindowText } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { ALL_ACCOUNTS, defaultSeason, queries } from "../lib/queries";

type Props = {
  account: Account;
  refreshKey: number;
  accounts: Account[] | null;
  onOpenMatch: (matchId: string, round?: number, puuid?: string) => void;
};

type Extra = Omit<OverviewFilters, "season">;

const NO_EXTRA: Extra = { mapId: null, agentId: null, role: null, days: null, party: null };

const PERIODS = (): PillOption<number>[] => [
  { value: 7, label: t("7 derniers jours", "Last 7 days") },
  { value: 30, label: t("30 derniers jours", "Last 30 days") },
];

const PARTIES = (): PillOption<Party>[] => [
  { value: "solo", label: t("Solo", "Solo") },
  { value: "group", label: t("En groupe", "In a group") },
];

let remembered: { puuid: string; extra: Extra } | null = null;

type BigStat = {
  label: string;
  value: string;
  delta: number;
  digits: number;
  suffix: string;
  reference: string;
  you: number;
  lobby: number;
  lobbyText: string;
};

export function Home({ account, accounts, onOpenMatch }: Props) {
  const puuid = accounts ? ALL_ACCOUNTS : account.puuid;
  const [season, setSeason] = useState<string | null | undefined>(() => defaultSeason(puuid));
  const seasonsQuery = useQuery(queries.seasons(puuid));
  const seasons = seasonsQuery.data ?? [];
  const [scope, setScope] = useState(puuid);
  const [extra, setExtra] = useState<Extra>(() => (remembered?.puuid === puuid ? remembered.extra : NO_EXTRA));
  if (scope !== puuid) {
    setScope(puuid);
    setSeason(defaultSeason(puuid));
    setExtra(NO_EXTRA);
  }
  const options = useQuery(queries.filterOptions(puuid)).data ?? null;
  const overviewQuery = useQuery(season === undefined ? null : queries.overview(puuid, { ...extra, season }));
  const recent = useQuery(queries.recent(puuid, 10)).data ?? [];
  const flaws = useQuery(accounts ? null : queries.flaws(puuid)).data ?? null;
  const thresholds = useQuery(queries.thresholds()).data?.values;
  const overview = overviewQuery.data ?? null;
  const error = overviewQuery.error ?? seasonsQuery.error;

  useEffect(() => {
    remembered = { puuid, extra };
  }, [puuid, extra]);

  useEffect(() => {
    if (season === undefined && seasonsQuery.data) setSeason(seasonsQuery.data[0]?.short ?? null);
  }, [season, seasonsQuery.data]);

  const filtered = Object.values(extra).some((value) => value !== null);
  const rr = account.rr ?? 0;
  const stats: BigStat[] = overview
    ? [
        {
          label: "ACS",
          value: fmt(overview.acs),
          delta: overview.acs - overview.lobby.acs,
          digits: 0,
          suffix: "",
          reference: `lobby ${fmt(overview.lobby.acs)}`,
          you: overview.acs,
          lobby: overview.lobby.acs,
          lobbyText: fmt(overview.lobby.acs),
        },
        {
          label: t("Dégâts par round", "Damage per round"),
          value: fmt(overview.adr, 1),
          delta: overview.adr - overview.lobby.adr,
          digits: 1,
          suffix: "",
          reference: `lobby ${fmt(overview.lobby.adr, 1)}`,
          you: overview.adr,
          lobby: overview.lobby.adr,
          lobbyText: fmt(overview.lobby.adr, 1),
        },
        {
          label: "K/D",
          value: fmt(overview.kd, 2),
          delta: overview.kd - overview.lobby.kd,
          digits: 2,
          suffix: "",
          reference: `lobby ${fmt(overview.lobby.kd, 2)}`,
          you: overview.kd,
          lobby: overview.lobby.kd,
          lobbyText: fmt(overview.lobby.kd, 2),
        },
        {
          label: t("Headshot", "Headshot"),
          value: pct(overview.hsPct),
          delta: overview.hsPct - overview.lobby.hsPct,
          digits: 1,
          suffix: t(" pt", " pts"),
          reference: `lobby ${pct(overview.lobby.hsPct)}`,
          you: overview.hsPct,
          lobby: overview.lobby.hsPct,
          lobbyText: pct(overview.lobby.hsPct),
        },
      ]
    : [];
  const timeline = [...recent].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const recentWins = timeline.filter((game) => game.won).length;

  return (
    <div className="content">
      <div className="stack">
        <h1 className="title">
          {accounts ? t("Tous les comptes", "All accounts") : `${greeting()}, ${account.name}`}
        </h1>
        <p className="muted">
          {accounts
            ? t(`Stats cumulées de tes ${accounts.length} comptes.`, `Combined stats from your ${accounts.length} accounts.`)
            : account.lastSyncAt
              ? t(`Dernière synchro ${timeAgo(account.lastSyncAt)}.`, `Last synced ${timeAgo(account.lastSyncAt)}.`)
              : t("Première synchro en cours.", "First sync in progress.")}
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="hero">
        {accounts ? (
          <ul className="home-accounts" aria-label={t("Comptes", "Accounts")}>
            {accounts.map((item) => (
              <li key={item.puuid}>
                <RankBadge tier={item.tier} size={44} label={tierLabel(item.tierName)} />
                <span className="stack" style={{ gap: 0 }}>
                  <strong>
                    {item.name} <span className="faint">#{item.tag}</span>
                  </strong>
                  <span className="faint" style={{ fontSize: 13 }}>
                    {tierLabel(item.tierName)}
                    {item.tier ? `, ${item.rr ?? 0} RR` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rank">
            <RankBadge tier={account.tier} size={104} label={tierLabel(account.tierName)} />
            <div className="stack" style={{ gap: 10, flexGrow: 1 }}>
              <span className="rank-name">{tierLabel(account.tierName)}</span>
              {account.tier ? (
                <div className="row" style={{ maxWidth: 300 }}>
                  <div className="bar" style={{ flexGrow: 1 }}>
                    <span style={{ width: `${Math.min(rr, 100)}%` }} />
                  </div>
                  <strong>{rr} RR</strong>
                </div>
              ) : null}
              {account.peakTierName && (
                <span className="row muted" style={{ gap: 6, fontSize: 13 }}>
                  {t("Peak", "Peak")}
                  <RankBadge tier={account.peakTier} size={24} label={tierLabel(account.peakTierName)} />
                  {tierLabel(account.peakTierName)}
                </span>
              )}
            </div>
          </div>
        )}
        {overview && overview.matches > 0 && (
          <div className="home-record">
            <WinRing wins={overview.wins} losses={overview.losses} winPct={overview.winPct} />
            <div className="stack" style={{ gap: 10 }}>
              <span className="label">
                {season ? seasonLabel(season) : t("Global", "All time")}
                {filtered ? t(", avec filtres", ", filtered") : ""}
              </span>
              <span className="home-legend">
                <i className="home-dot is-win" aria-hidden="true" />
                {t(`${overview.wins} victoires`, `${overview.wins} ${overview.wins === 1 ? "win" : "wins"}`)}
              </span>
              <span className="home-legend">
                <i className="home-dot is-loss" aria-hidden="true" />
                {t(`${overview.losses} défaites`, `${overview.losses} ${overview.losses === 1 ? "loss" : "losses"}`)}
              </span>
              <span className="faint" style={{ fontSize: 13 }}>
                {t(`${overview.matches} matchs joués`, `${overview.matches} ${overview.matches === 1 ? "match" : "matches"} played`)}
              </span>
            </div>
          </div>
        )}
      </div>

      {timeline.length > 0 && (
        <section className="stack" style={{ gap: 14 }}>
          <div className="row between wrap" style={{ alignItems: "baseline" }}>
            <h2 className="section-title">{t("Forme récente", "Recent form")}</h2>
            <div className="row wrap" style={{ gap: 14, alignItems: "center" }}>
              <span className="faint" style={{ fontSize: 13 }}>
                {t(
                  `${recentWins} V ${timeline.length - recentWins} D sur les ${timeline.length} derniers`,
                  `${recentWins}W ${timeline.length - recentWins}L in the last ${timeline.length}`,
                )}
              </span>
              {!accounts && (
                <ExportRecapButton kind="session" account={account} label={t("Exporter ma dernière session", "Export my last session")} />
              )}
            </div>
          </div>
          <ul className="home-form" aria-label={t("Résultats des derniers matchs, du plus ancien au plus récent", "Recent match results, oldest to newest")}>
            {timeline.map((game) => {
              const text = matchText(game);
              return (
                <li key={`${game.matchId}|${game.puuid}`}>
                  <button
                    type="button"
                    className={`home-form-cell ${game.won ? "is-win" : "is-loss"}`}
                    title={text}
                    aria-label={t(`${text}. Ouvrir le match`, `${text}. Open the match`)}
                    onClick={() => onOpenMatch(game.matchId, undefined, game.puuid)}
                  >
                    {game.won ? t("V", "W") : t("D", "L")}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="stack" style={{ gap: 20 }}>
        <div className="home-filters">
          <div className="chips" role="group" aria-label={t("Acte", "Act")}>
            {seasons.map((item) => (
              <button
                key={item.short}
                type="button"
                className={`chip${season === item.short ? " active" : ""}`}
                onClick={() => setSeason(item.short)}
              >
                {seasonLabel(item.short)}
              </button>
            ))}
            <button type="button" className={`chip${season === null ? " active" : ""}`} onClick={() => setSeason(null)}>
              {t("Global", "All time")}
            </button>
          </div>
          <div className="chips" role="group" aria-label={t("Filtres", "Filters")}>
            {(options?.maps.length ?? 0) > 1 && (
              <FilterPill
                label={t("Map", "Map")}
                allLabel={t("Toutes les maps", "All maps")}
                value={extra.mapId}
                options={options!.maps.map((map) => ({ value: map.id, label: map.name, count: map.matches }))}
                onChange={(mapId) => setExtra({ ...extra, mapId })}
              />
            )}
            {(options?.agents.length ?? 0) > 1 && (
              <FilterPill
                label={t("Agent", "Agent")}
                allLabel={t("Tous les agents", "All agents")}
                value={extra.agentId}
                options={options!.agents.map((agent) => ({
                  value: agent.id,
                  label: agent.name,
                  count: agent.matches,
                  image: agentIcon(agent.id),
                }))}
                onChange={(agentId) => setExtra({ ...extra, agentId })}
              />
            )}
            {(options?.roles.length ?? 0) > 1 && (
              <FilterPill
                label={t("Rôle", "Role")}
                allLabel={t("Tous les rôles", "All roles")}
                value={extra.role}
                options={options!.roles.map((role) => ({ value: role.id, label: roleLabel(role.id), count: role.matches }))}
                onChange={(role) => setExtra({ ...extra, role })}
              />
            )}
            <FilterPill
              label={t("Période", "Period")}
              allLabel={t("Tout", "All")}
              value={extra.days}
              options={PERIODS()}
              onChange={(days) => setExtra({ ...extra, days })}
            />
            <FilterPill
              label={t("Solo ou en groupe", "Solo or group")}
              allLabel={t("Solo et en groupe", "Solo and group")}
              value={extra.party}
              options={PARTIES()}
              onChange={(party) => setExtra({ ...extra, party })}
            />
            {filtered && (
              <button type="button" className="chip filter-reset" onClick={() => setExtra(NO_EXTRA)}>
                <Icon name="close" size={14} strokeWidth={2} />
                {t("Réinitialiser", "Reset")}
              </button>
            )}
          </div>
        </div>

        {overview && overview.matches > 0 ? (
          <>
            <div className="stat-grid home-stat-grid">
              {stats.map((stat) => (
                <div className="big-stat stack" key={stat.label}>
                  <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                    {stat.label}
                  </span>
                  <span className="value">{stat.value}</span>
                  <span style={{ fontSize: 13 }}>
                    <strong className={stat.delta >= 0 ? "good" : "bad"}>
                      {signed(stat.delta, stat.digits)}
                      {stat.suffix}
                    </strong>{" "}
                    <span className="faint">{stat.reference}</span>
                  </span>
                  <CompareBar stat={stat} />
                  {stat.label === "ACS" && timeline.length >= 3 && <Sparkline matches={timeline} />}
                </div>
              ))}
            </div>
            <div className="small-stats">
              <Small label={t("KAD", "KAD")} value={fmt(overview.kad, 2)} />
              <Small label={t("Kills par round", "Kills per round")} value={fmt(overview.killsPerRound, 2)} />
              <Small label={t("Kills", "Kills")} value={fmt(overview.kills)} />
              <Small label={t("Morts", "Deaths")} value={fmt(overview.deaths)} />
              <Small label={t("Assists", "Assists")} value={fmt(overview.assists)} />
              <Small label={t("Rounds", "Rounds")} value={fmt(overview.rounds)} />
            </div>
          </>
        ) : (
          <div className="empty">
            {!overview
              ? t("Chargement des statistiques...", "Loading stats...")
              : filtered
                ? t("Aucun match ne correspond à ces filtres.", "No matches fit these filters.")
                : t("Aucun match compétitif synchronisé sur cette période pour l'instant.", "No competitive matches synced for this period yet.")}
          </div>
        )}
      </section>

      {flaws && flaws.deaths > 0 && (
        <section className="stack" style={{ gap: 20 }}>
          <div className="row between wrap" style={{ alignItems: "baseline" }}>
            <h2 className="section-title">{t("Tes défauts du moment", "Your current flaws")}</h2>
            <span className="faint" style={{ fontSize: 13 }}>
              {t(
                `Sur tes ${flaws.matches} derniers matchs compétitifs`,
                `Over your last ${flaws.matches} competitive ${flaws.matches === 1 ? "match" : "matches"}`,
              )}
            </span>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <FlawStat
              value={pct((flaws.untraded * 100) / flaws.deaths, 0)}
              ratio={flaws.untraded / flaws.deaths}
              title={t("de tes morts ne sont pas tradées", "of your deaths go untraded")}
              detail={t(
                `${flaws.untraded} sur ${flaws.deaths} : personne n'a tué ton tueur ${tradeWindowText(thresholds?.tradeWindowMs ?? 3000)}.`,
                `${flaws.untraded} of ${flaws.deaths}: nobody killed your killer ${tradeWindowText(thresholds?.tradeWindowMs ?? 3000)}.`,
              )}
            />
            <FlawStat
              value={pct((flaws.isolated * 100) / flaws.deaths, 0)}
              ratio={flaws.isolated / flaws.deaths}
              title={t("de tes morts arrivent isolé", "of your deaths happen isolated")}
              detail={t(
                `${flaws.isolated} sur ${flaws.deaths}, sans coéquipier à moins de ${fmt(thresholds?.isolationMeters ?? 15)} m.`,
                `${flaws.isolated} of ${flaws.deaths}, with no teammate within ${fmt(thresholds?.isolationMeters ?? 15)} m.`,
              )}
            />
            <FlawStat
              value={flaws.firstDeaths ? `1 / ${Math.max(1, Math.round(flaws.rounds / flaws.firstDeaths))}` : "0"}
              ratio={flaws.rounds ? flaws.firstDeaths / flaws.rounds : 0}
              title={t("rounds où tu meurs en premier", "rounds where you die first")}
              detail={t(
                `${flaws.firstDeaths} first deaths en ${flaws.rounds} rounds.`,
                `${flaws.firstDeaths} first ${flaws.firstDeaths === 1 ? "death" : "deaths"} in ${flaws.rounds} rounds.`,
              )}
            />
          </div>
        </section>
      )}

      <section className="stack" style={{ gap: 10 }}>
        <h2 className="section-title">{t("Derniers matchs", "Recent matches")}</h2>
        {recent.length > 0 && <span className="faint" style={{ fontSize: 13 }}>{t("Clique sur un match pour voir son détail.", "Click a match to see its details.")}</span>}
        {recent.length === 0 ? (
          <div className="empty">{t("Tes matchs apparaîtront ici dès la fin de la synchro.", "Your matches will show up here once the sync is done.")}</div>
        ) : (
          <MatchList matches={recent} accounts={accounts} onOpen={(matchId, owner) => onOpenMatch(matchId, undefined, owner)} />
        )}
      </section>
    </div>
  );
}

function matchText(game: RecentMatch): string {
  const result = game.won ? t("Victoire", "Victory") : t("Défaite", "Defeat");
  return `${game.mapName ?? t("Map inconnue", "Unknown map")}, ${result} ${game.roundsWon}-${game.roundsLost}, ACS ${fmt(game.acs)}`;
}

function WinRing({ wins, losses, winPct }: { wins: number; losses: number; winPct: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const total = wins + losses;
  const share = total > 0 ? wins / total : 0;
  const gap = wins > 0 && losses > 0 ? 4 : 0;
  const winLength = Math.max(share * circumference - gap, 0);
  const lossLength = Math.max((1 - share) * circumference - gap, 0);
  return (
    <div className="home-ring">
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={t(
          `Taux de victoire ${pct(winPct, 0)} : ${wins} victoires, ${losses} défaites`,
          `Win rate ${pct(winPct, 0)}: ${wins} ${wins === 1 ? "win" : "wins"}, ${losses} ${losses === 1 ? "loss" : "losses"}`,
        )}
      >
        <g transform="rotate(-90 60 60)">
          {total === 0 && <circle cx="60" cy="60" r={radius} className="home-ring-empty" />}
          {lossLength > 0 && (
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="home-ring-loss"
              strokeDasharray={`${lossLength} ${circumference}`}
              strokeDashoffset={-(share * circumference + gap / 2)}
            />
          )}
          {winLength > 0 && (
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="home-ring-win"
              strokeDasharray={`${winLength} ${circumference}`}
              strokeDashoffset={-gap / 2}
            />
          )}
        </g>
      </svg>
      <div className="home-ring-center" aria-hidden="true">
        <span className="home-ring-value">{pct(winPct, 0)}</span>
        <span className="home-ring-record">
          {t(`${wins} V ${losses} D`, `${wins}W ${losses}L`)}
        </span>
      </div>
    </div>
  );
}

function CompareBar({ stat }: { stat: BigStat }) {
  const max = 1.4 * Math.max(stat.you, stat.lobby);
  const you = max > 0 ? (Math.max(stat.you, 0) / max) * 100 : 0;
  const lobby = max > 0 ? (Math.max(stat.lobby, 0) / max) * 100 : 0;
  return (
    <div className="home-compare" role="img" aria-label={t(
        `${stat.label} : toi ${stat.value}, moyenne du lobby ${stat.lobbyText}`,
        `${stat.label}: you ${stat.value}, lobby average ${stat.lobbyText}`,
      )}
    >
      <div className="home-compare-track">
        <span className={`home-compare-fill ${stat.delta >= 0 ? "is-above" : "is-below"}`} style={{ width: `${you}%` }} />
        <span className="home-compare-tick" style={{ left: `${lobby}%` }} />
      </div>
      <span className="home-compare-label" style={{ left: `${lobby}%` }} aria-hidden="true">
        {t("lobby", "lobby")}
      </span>
    </div>
  );
}

function Sparkline({ matches }: { matches: RecentMatch[] }) {
  const width = 200;
  const height = 44;
  const pad = 5;
  const values = matches.map((game) => game.acs);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = matches.map((game, index) => ({
    game,
    x: pad + (index * (width - pad * 2)) / Math.max(matches.length - 1, 1),
    y: max === min ? height / 2 : pad + ((max - game.acs) * (height - pad * 2)) / span,
  }));
  return (
    <div className="home-spark">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t(
          `ACS sur les ${matches.length} derniers matchs, de ${fmt(min)} à ${fmt(max)}`,
          `ACS over the last ${matches.length} matches, from ${fmt(min)} to ${fmt(max)}`,
        )}
      >
        <polyline className="home-spark-line" points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
        {points.map((point) => (
          <circle key={point.game.matchId} cx={point.x} cy={point.y} r="3.2" className={point.game.won ? "is-win" : "is-loss"}>
            <title>{matchText(point.game)}</title>
          </circle>
        ))}
      </svg>
      <span className="faint">{t(`ACS des ${matches.length} derniers matchs`, `ACS over the last ${matches.length} matches`)}</span>
    </div>
  );
}

function FlawStat({ value, ratio, title, detail }: { value: string; ratio: number; title: string; detail: string }) {
  const share = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="flaw-value" style={{ fontSize: 44 }}>
        {value}
      </span>
      <div className="home-gauge" role="img" aria-label={t(`${pct(share, 0)} des cas`, `${pct(share, 0)} of cases`)}>
        <span style={{ width: `${share}%` }} />
      </div>
      <strong style={{ fontSize: 15 }}>{title}</strong>
      <span className="hint">{detail}</span>
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack" style={{ gap: 2, minWidth: 76 }}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
