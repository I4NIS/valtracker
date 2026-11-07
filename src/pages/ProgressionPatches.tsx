import "../styles/riot.css";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "../components/Skeleton";
import { onSyncProgress, type PatchLine } from "../lib/api";
import { fmt, formatDate, pct, signed } from "../lib/format";
import { t } from "../lib/i18n";
import { invalidate, useQuery } from "../lib/query";
import { queries } from "../lib/queries";

const PUBLISHED: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

type Column = {
  label: string;
  value: (line: PatchLine) => number | null;
  show: (value: number) => string;
  delta: (value: number) => string;
  tinted?: boolean;
};

const COLUMNS = (): Column[] => [
  { label: t("Victoires", "Win rate"), value: (line) => line.winPct, show: (value) => pct(value, 0), delta: (value) => t(`${signed(value, 1)} pts`, `${signed(value, 1)} pts`) },
  { label: "ACS", value: (line) => line.acs, show: (value) => fmt(value), delta: (value) => signed(value) },
  { label: "K/D", value: (line) => line.kd, show: (value) => fmt(value, 2), delta: (value) => signed(value, 2) },
  { label: "HS", value: (line) => line.hsPct, show: (value) => pct(value, 0), delta: (value) => t(`${signed(value, 1)} pts`, `${signed(value, 1)} pts`) },
  { label: t("RR net", "Net RR"), value: (line) => line.rrNet, show: (value) => signed(value), delta: (value) => signed(value), tinted: true },
];

function Delta({ column, current, previous }: { column: Column; current: number | null; previous: PatchLine | undefined }) {
  const before = previous ? column.value(previous) : null;
  if (current === null || before === null) return <small className="faint">&nbsp;</small>;
  const change = current - before;
  const tone = Math.abs(change) < 1e-9 ? "faint" : change > 0 ? "win" : "bad";
  return <small className={tone}>{column.delta(change)}</small>;
}

function PatchRow({ line, previous, columns }: { line: PatchLine; previous: PatchLine | undefined; columns: Column[] }) {
  const sub = [
    line.published ? t(`notes du ${formatDate(new Date(line.published), PUBLISHED)}`, `notes from ${formatDate(new Date(line.published), PUBLISHED)}`) : "",
    line.inferred > 0
      ? t(`dont ${matchCount(line.inferred)} daté${line.inferred > 1 ? "s" : ""} d'après les notes`, `${matchCount(line.inferred)} placed by the notes date`)
      : "",
  ].filter(Boolean);
  return (
    <div className="patch-row" role="row">
      <span className="stack" style={{ gap: 2, minWidth: 0 }} role="cell">
        <strong>{line.version ? `Patch ${line.version}` : t("Version inconnue", "Unknown version")}</strong>
        <span className="faint ellipsis" style={{ fontSize: 12 }}>
          {line.version ? sub.join(", ") : t("ni version enregistrée ni note de patch à cette date", "no stored version and no patch notes for that date")}
        </span>
      </span>
      <span className="patch-cell" role="cell">
        <strong>{line.matches}</strong>
        <small className="faint">{t(`${line.wins} V, ${line.matches - line.wins} D`, `${line.wins} W, ${line.matches - line.wins} L`)}</small>
      </span>
      {columns.map((column) => {
        const value = column.value(line);
        return (
          <span className="patch-cell" role="cell" key={column.label}>
            <strong className={column.tinted && value !== null ? (value >= 0 ? "win" : "bad") : undefined}>
              {value === null ? <span className="faint">{t("aucune donnée", "no data")}</span> : column.show(value)}
            </strong>
            {line.version ? <Delta column={column} current={value} previous={previous} /> : <small className="faint">&nbsp;</small>}
          </span>
        );
      })}
    </div>
  );
}

function PatchesSkeleton() {
  return (
    <SkeletonGroup className="patch-table" label={t("Chargement des patchs", "Loading patches")}>
      {repeat(4, (row) => (
        <div className="patch-row" key={row}>
          <span className="stack" style={{ gap: 4 }}>
            <SkeletonLine width={90} size={15} />
            <SkeletonLine width="70%" size={12} />
          </span>
          {repeat(6, (cell) => (
            <span className="patch-cell" key={cell}>
              <SkeletonLine width={44} size={15} />
              <SkeletonBlock width={34} height={9} radius={4} />
            </span>
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}

onSyncProgress((progress) => {
  if (!progress.running) invalidate("patches|");
}).catch(() => undefined);

export function Patches({ puuid, season }: { puuid: string; season: string | null }) {
  const query = useQuery(queries.patches(puuid, season));
  const data = query.data;
  const columns = COLUMNS();

  if (query.error && !data) return <p className="form-error">{query.error}</p>;
  if (!data) return <PatchesSkeleton />;
  const known = data.patches.filter((line) => line.version !== null);

  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="section-head">
        <h2 className="section-title">{t("Par patch", "By patch")}</h2>
        <span className="faint">
          {data.notes === 0
            ? t("Notes de patch pas encore récupérées, elles le seront à la prochaine synchro", "Patch notes not fetched yet, they will be on the next sync")
            : t("Écarts comparés au patch précédent", "Changes compared with the previous patch")}
        </span>
      </div>
      {data.patches.length === 0 ? (
        <div className="empty">{t("Aucun match compétitif synchronisé sur cette période.", "No competitive matches synced for this period.")}</div>
      ) : (
        <div className="list-scroll">
          <div className="patch-table" role="table" aria-label={t("Statistiques par patch", "Stats by patch")}>
            <div className="patch-row head" role="row">
              <span role="columnheader">Patch</span>
              <span role="columnheader">{t("Matchs", "Matches")}</span>
              {columns.map((column) => (
                <span role="columnheader" key={column.label}>
                  {column.label}
                </span>
              ))}
            </div>
            {data.patches.map((line) => (
              <PatchRow key={line.version ?? "unknown"} line={line} previous={line.version ? known[known.indexOf(line) + 1] : undefined} columns={columns} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
