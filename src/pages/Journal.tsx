import "../styles/journal.css";
import { useEffect, useMemo, useState } from "react";
import { errorMessage, type Account } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt, fullDate, pct } from "../lib/format";
import { firstLine, journal, sameTag, type NoteEntry, type TagStat } from "../lib/journal";

type Props = {
  account: Account;
  refreshKey: number;
  onOpenMatch: (matchId: string) => void;
};

const SMALL_SAMPLE = 3;

export function Journal({ account, refreshKey, onOpenMatch }: Props) {
  const [notes, setNotes] = useState<NoteEntry[] | null>(null);
  const [tags, setTags] = useState<TagStat[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([journal.listNotes(account.puuid), journal.listTags(account.puuid)])
      .then(([list, stats]) => {
        if (!alive) return;
        setNotes(list);
        setTags(stats);
        setFilter((current) => (current && stats.some((item) => sameTag(item.tag, current)) ? current : null));
      })
      .catch((err) => {
        if (!alive) return;
        setNotes([]);
        setError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [account.puuid, refreshKey]);

  const visible = useMemo(
    () => (notes ?? []).filter((entry) => !filter || entry.tags.some((tag) => sameTag(tag, filter))),
    [notes, filter],
  );

  const maxAcs = Math.max(1, ...tags.flatMap((item) => [item.avgAcs, item.withoutAcs]));

  return (
    <div className="content">
      <div className="stack">
        <span className="eyebrow">Tes notes personnelles</span>
        <h1 className="title">Journal</h1>
        <p className="muted">Tes notes et tags sur tes matchs, et tes résultats avec et sans chaque tag.</p>
      </div>

      {error && <p className="form-error">{error}</p>}

      {notes === null ? (
        <div className="empty">Chargement du journal...</div>
      ) : notes.length === 0 ? (
        <div className="empty journal-empty">
          <strong>Aucune note pour l'instant</strong>
          <span>
            Ouvre un match depuis la page Matchs, puis l'onglet Note pour écrire ce que tu en retiens et ajouter des tags comme
            Fatigué, En duo ou Nouvelle sensi. Tes statistiques par tag apparaîtront ici.
          </span>
        </div>
      ) : (
        <>
          {tags.length > 0 && (
            <section className="stack" style={{ gap: 16 }}>
              <div className="row between wrap">
                <h2 className="section-title">Tes tags</h2>
                <span className="journal-legend">
                  <span>
                    <i className="with" />
                    Avec le tag
                  </span>
                  <span>
                    <i className="without" />
                    Sans le tag
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
              <h2 className="section-title">Matchs notés</h2>
              <span className="faint" style={{ fontSize: 13 }}>
                {visible.length} {visible.length > 1 ? "matchs" : "match"}
              </span>
            </div>
            {tags.length > 0 && (
              <div className="chips" role="group" aria-label="Filtrer par tag">
                <button type="button" className={`chip${filter === null ? " active" : ""}`} aria-pressed={filter === null} onClick={() => setFilter(null)}>
                  Tous
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
              {visible.length === 0 && <div className="empty">Aucun match noté avec ce tag.</div>}
            </div>
          </section>
        </>
      )}
    </div>
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
            {stat.matches} {stat.matches > 1 ? "matchs" : "match"}
            {stat.avgScore !== null ? `, score moyen ${fmt(stat.avgScore)}` : ""}
          </span>
        </div>
        {stat.matches < SMALL_SAMPLE && <span className="journal-sample">Peu de matchs</span>}
      </div>
      <Compare
        label="Victoires"
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
        <span className="muted">{withoutValue !== null ? format(withoutValue) : "Aucun"}</span>
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
          <strong>{entry.mapName ?? "Map inconnue"}</strong>
          <strong className={entry.won ? "win" : "bad"}>
            {entry.won ? "Victoire" : "Défaite"} {entry.roundsWon}-{entry.roundsLost}
          </strong>
          <span className="faint" style={{ fontSize: 13 }}>
            {fullDate(entry.startedAt)}
          </span>
        </span>
        {line ? <span className="journal-row-note ellipsis">{line}</span> : <span className="faint journal-row-note">Pas de texte</span>}
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
