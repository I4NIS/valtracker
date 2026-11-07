import "../styles/journal.css";
import { useEffect, useMemo, useState } from "react";
import { FavoriteButton } from "../components/FavoriteButton";
import type { Account } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { favoriteLabel, type FavoriteEntry, type FavoriteKind } from "../lib/favorites";
import { fmt, fullDate, pct } from "../lib/format";
import { t } from "../lib/i18n";
import { firstLine, sameTag, type NoteEntry, type TagStat } from "../lib/journal";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";

type Props = {
  account: Account;
  refreshKey: number;
  onOpenMatch: (matchId: string, round?: number, puuid?: string, death?: boolean) => void;
};

type View = "notes" | "favorites";

const SMALL_SAMPLE = 3;

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);

const kindFilters = (): { id: FavoriteKind; label: string }[] => [
  { id: "match", label: t("Matchs", "Matches") },
  { id: "round", label: "Rounds" },
  { id: "death", label: t("Morts", "Deaths") },
];

export function Journal({ account, onOpenMatch }: Props) {
  const [view, setView] = useState<View>("notes");

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">{t("Tes notes personnelles", "Your personal notes")}</span>
        <h1 className="title">Journal</h1>
        <p className="muted">
          {view === "notes"
            ? t("Tes notes et tags sur tes matchs, et tes résultats avec et sans chaque tag.", "Your notes and tags on your matches, and your results with and without each tag.")
            : t("Les matchs, rounds et morts que tu as mis en favori.", "The matches, rounds and deaths you marked as favorites.")}
        </p>
      </div>

      <div className="segmented" role="tablist" aria-label={t("Sections du journal", "Journal sections")} style={{ alignSelf: "flex-start" }}>
        <button type="button" role="tab" aria-selected={view === "notes"} className={view === "notes" ? "active" : undefined} onClick={() => setView("notes")}>
          Notes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "favorites"}
          className={view === "favorites" ? "active" : undefined}
          onClick={() => setView("favorites")}
        >
          {t("Favoris", "Favorites")}
        </button>
      </div>

      {view === "notes" ? (
        <NotesView account={account} onOpenMatch={onOpenMatch} />
      ) : (
        <FavoritesView account={account} onOpenMatch={onOpenMatch} />
      )}
    </div>
  );
}

function FavoritesView({ account, onOpenMatch }: Pick<Props, "account" | "onOpenMatch">) {
  const query = useQuery(queries.favorites(account.puuid));
  const list = query.data ?? (query.error ? [] : null);
  const [kind, setKind] = useState<FavoriteKind | null>(null);
  const visible = useMemo(() => (list ?? []).filter((entry) => !kind || entry.kind === kind), [list, kind]);

  const open = (entry: FavoriteEntry) => {
    if (entry.kind === "match" || entry.roundIndex === null) onOpenMatch(entry.matchId);
    else onOpenMatch(entry.matchId, entry.roundIndex, undefined, entry.kind === "death");
  };

  if (query.error) return <p className="form-error">{query.error}</p>;
  if (list === null) return <div className="empty">{t("Chargement des favoris...", "Loading favorites...")}</div>;
  if (list.length === 0) {
    return (
      <div className="empty journal-empty">
        <strong>{t("Aucun favori pour l'instant", "No favorites yet")}</strong>
        <span>
          {t(
            "L'étoile du détail d'un match ajoute aux favoris le match entier, un round ou une de tes morts.",
            "The star in a match's details adds the whole match, a round or one of your deaths to your favorites.",
          )}
        </span>
      </div>
    );
  }

  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="row between wrap">
        <div className="chips" role="group" aria-label={t("Filtrer les favoris", "Filter favorites")}>
          <button type="button" className={`chip${kind === null ? " active" : ""}`} aria-pressed={kind === null} onClick={() => setKind(null)}>
            {t("Tous", "All")}
          </button>
          {kindFilters().map((item) => {
            const count = list.filter((entry) => entry.kind === item.id).length;
            if (count === 0) return null;
            return (
              <button
                key={item.id}
                type="button"
                className={`chip${kind === item.id ? " active" : ""}`}
                aria-pressed={kind === item.id}
                onClick={() => setKind(kind === item.id ? null : item.id)}
              >
                {item.label} <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>
        <span className="faint" style={{ fontSize: 13 }}>
          {t(`${visible.length} ${visible.length > 1 ? "favoris" : "favori"}`, `${visible.length} ${visible.length === 1 ? "favorite" : "favorites"}`)}
        </span>
      </div>
      <div className="journal-list">
        {visible.map((entry) => (
          <div className="fav-item" key={`${entry.kind}-${entry.matchId}-${entry.roundIndex ?? "all"}`}>
            <button type="button" className="journal-row" onClick={() => open(entry)}>
              {agentIcon(entry.agentId) ? <img src={agentIcon(entry.agentId)} alt={entry.agentName ?? ""} /> : <span className="journal-row-icon" />}
              <span className="stack journal-row-main">
                <span className="row wrap" style={{ gap: 4, columnGap: 10 }}>
                  <strong>{entry.mapName ?? t("Map inconnue", "Unknown map")}</strong>
                  <strong className={entry.won ? "win" : "bad"}>
                    {entry.won ? t("Victoire", "Victory") : t("Défaite", "Defeat")} {entry.roundsWon}-{entry.roundsLost}
                  </strong>
                  <span className="faint" style={{ fontSize: 13 }}>
                    {fullDate(entry.startedAt)}
                  </span>
                </span>
                <span className="journal-row-tags">
                  <span>{favoriteLabel(entry)}</span>
                </span>
              </span>
              <span className="journal-row-stats">
                <span className="muted">
                  {entry.kills} / {entry.deaths} / {entry.assists}
                </span>
              </span>
            </button>
            <FavoriteButton puuid={account.puuid} matchId={entry.matchId} kind={entry.kind} roundIndex={entry.roundIndex} />
          </div>
        ))}
        {visible.length === 0 && <div className="empty">{t("Aucun favori de ce type.", "No favorites of this type.")}</div>}
      </div>
    </section>
  );
}

function NotesView({ account, onOpenMatch }: Pick<Props, "account" | "onOpenMatch">) {
  const notesQuery = useQuery(queries.notes(account.puuid));
  const tagsQuery = useQuery(queries.tags(account.puuid));
  const notes = notesQuery.data ?? (notesQuery.error ? [] : null);
  const tags = tagsQuery.data ?? [];
  const error = notesQuery.error ?? tagsQuery.error;
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    setFilter((current) => (current && tags.some((item) => sameTag(item.tag, current)) ? current : null));
  }, [tags]);

  const visible = useMemo(
    () => (notes ?? []).filter((entry) => !filter || entry.tags.some((tag) => sameTag(tag, filter))),
    [notes, filter],
  );

  const maxAcs = Math.max(1, ...tags.flatMap((item) => [item.avgAcs, item.withoutAcs]));

  return (
    <>
      {error && <p className="form-error">{error}</p>}

      {notes === null ? (
        <div className="empty">{t("Chargement du journal...", "Loading the journal...")}</div>
      ) : notes.length === 0 ? (
        <div className="empty journal-empty">
          <strong>{t("Aucune note pour l'instant", "No notes yet")}</strong>
          <span>
            {t(
              "Ouvre un match depuis la page Matchs, puis l'onglet Note pour écrire ce que tu en retiens et ajouter des tags comme Fatigué, En duo ou Nouvelle sensi. Tes statistiques par tag apparaîtront ici.",
              "Open a match from the Matches page, then the Note tab to write down your takeaways and add tags like Tired, Duo or New sens. Your stats per tag will show up here.",
            )}
          </span>
        </div>
      ) : (
        <>
          {tags.length > 0 && (
            <section className="stack" style={{ gap: 16 }}>
              <div className="row between wrap">
                <h2 className="section-title">{t("Tes tags", "Your tags")}</h2>
                <span className="journal-legend">
                  <span>
                    <i className="with" />
                    {t("Avec le tag", "With the tag")}
                  </span>
                  <span>
                    <i className="without" />
                    {t("Sans le tag", "Without the tag")}
                  </span>
                </span>
              </div>
              <div className="journal-tags">
                {tags.map((stat) => (
                  <TagCard
                    key={stat.tag}
                    stat={stat}
                    maxAcs={maxAcs}
                    active={!!filter && sameTag(filter, stat.tag)}
                    onSelect={() => setFilter(filter && sameTag(filter, stat.tag) ? null : stat.tag)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="stack" style={{ gap: 16 }}>
            <div className="row between wrap">
              <h2 className="section-title">{t("Matchs notés", "Noted matches")}</h2>
              <span className="faint" style={{ fontSize: 13 }}>
                {matchCount(visible.length)}
              </span>
            </div>
            {tags.length > 0 && (
              <div className="chips" role="group" aria-label={t("Filtrer par tag", "Filter by tag")}>
                <button type="button" className={`chip${filter === null ? " active" : ""}`} aria-pressed={filter === null} onClick={() => setFilter(null)}>
                  {t("Tous", "All")}
                </button>
                {tags.map((stat) => {
                  const active = !!filter && sameTag(filter, stat.tag);
                  return (
                    <button
                      key={stat.tag}
                      type="button"
                      className={`chip${active ? " active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setFilter(active ? null : stat.tag)}
                    >
                      {stat.tag}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="journal-list">
              {visible.map((entry) => (
                <NoteRow key={entry.matchId} entry={entry} onOpen={() => onOpenMatch(entry.matchId)} />
              ))}
              {visible.length === 0 && <div className="empty">{t("Aucun match noté avec ce tag.", "No noted matches with this tag.")}</div>}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function TagCard({ stat, maxAcs, active, onSelect }: { stat: TagStat; maxAcs: number; active: boolean; onSelect: () => void }) {
  const hasBaseline = stat.withoutMatches > 0;
  return (
    <button type="button" className={`journal-tag-card${active ? " active" : ""}`} aria-pressed={active} onClick={onSelect}>
      <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <strong className="journal-tag-name ellipsis">{stat.tag}</strong>
          <span className="faint" style={{ fontSize: 12 }}>
            {matchCount(stat.matches)}
            {stat.avgScore !== null ? t(`, score moyen ${fmt(stat.avgScore)}`, `, avg score ${fmt(stat.avgScore)}`) : ""}
          </span>
        </div>
        {stat.matches < SMALL_SAMPLE && <span className="journal-sample">{t("Peu de matchs", "Few matches")}</span>}
      </div>
      <Compare
        label={t("Victoires", "Win rate")}
        withValue={stat.winRate}
        withoutValue={hasBaseline ? stat.withoutWinRate : null}
        max={100}
        format={(value) => pct(value, 0)}
      />
      <Compare
        label="ACS"
        withValue={stat.avgAcs}
        withoutValue={hasBaseline ? stat.withoutAcs : null}
        max={maxAcs}
        format={(value) => fmt(value)}
      />
    </button>
  );
}

function Compare({
  label,
  withValue,
  withoutValue,
  max,
  format,
}: {
  label: string;
  withValue: number;
  withoutValue: number | null;
  max: number;
  format: (value: number) => string;
}) {
  const width = (value: number) => `${Math.max(2, Math.min(100, (value / max) * 100))}%`;
  return (
    <div className="journal-compare">
      <span className="label">{label}</span>
      <div className="journal-bar-row">
        <span className="journal-bar">
          <span className="with" style={{ width: width(withValue) }} />
        </span>
        <strong>{format(withValue)}</strong>
      </div>
      <div className="journal-bar-row">
        <span className="journal-bar">
          {withoutValue !== null && <span className="without" style={{ width: width(withoutValue) }} />}
        </span>
        <span className="muted">{withoutValue !== null ? format(withoutValue) : t("Aucun", "None")}</span>
      </div>
    </div>
  );
}

function NoteRow({ entry, onOpen }: { entry: NoteEntry; onOpen: () => void }) {
  const line = firstLine(entry.note);
  return (
    <button type="button" className="journal-row" onClick={onOpen}>
      {agentIcon(entry.agentId) ? <img src={agentIcon(entry.agentId)} alt={entry.agentName ?? ""} /> : <span className="journal-row-icon" />}
      <span className="stack journal-row-main">
        <span className="row wrap" style={{ gap: 4, columnGap: 10 }}>
          <strong>{entry.mapName ?? t("Map inconnue", "Unknown map")}</strong>
          <strong className={entry.won ? "win" : "bad"}>
            {entry.won ? t("Victoire", "Victory") : t("Défaite", "Defeat")} {entry.roundsWon}-{entry.roundsLost}
          </strong>
          <span className="faint" style={{ fontSize: 13 }}>
            {fullDate(entry.startedAt)}
          </span>
        </span>
        {line ? <span className="journal-row-note ellipsis">{line}</span> : <span className="faint journal-row-note">{t("Pas de texte", "No text")}</span>}
        {entry.tags.length > 0 && (
          <span className="journal-row-tags">
            {entry.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </span>
        )}
      </span>
      <span className="journal-row-stats">
        <span className="muted">
          {entry.kills} / {entry.deaths} / {entry.assists}
        </span>
        <span className="faint" style={{ fontSize: 12 }}>
          ACS {fmt(entry.acs)}
          {entry.score !== null ? `, score ${entry.score}` : ""}
        </span>
      </span>
    </button>
  );
}
