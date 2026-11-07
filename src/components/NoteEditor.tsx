import "../styles/journal.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "../lib/api";
import { journal, sameTag, SUGGESTED_TAGS } from "../lib/journal";
import { invalidate } from "../lib/query";
import { Icon } from "./Icon";

type Status = "loading" | "idle" | "pending" | "saving" | "saved" | "error";

type Draft = { note: string; tags: string[] };

const DEBOUNCE_MS = 700;
const MAX_TAG_CHARS = 32;

type Props = {
  puuid: string;
  matchId: string;
};

export function NoteEditor({ puuid, matchId }: Props) {
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<Draft>({ note: "", tags: [] });
  const timer = useRef<number | null>(null);
  const version = useRef(0);

  const persist = async (target: { puuid: string; matchId: string }, value: Draft, mounted: boolean) => {
    const current = ++version.current;
    if (mounted) setStatus("saving");
    try {
      await journal.saveNote(target.puuid, target.matchId, value.note, value.tags);
      invalidate("journal|");
      if (mounted && current === version.current) {
        setStatus("saved");
        setError(null);
      }
    } catch (err) {
      if (mounted && current === version.current) {
        setStatus("error");
        setError(errorMessage(err));
      }
    }
  };

  useEffect(() => {
    let alive = true;
    const target = { puuid, matchId };
    setStatus("loading");
    setLoaded(false);
    setError(null);
    setNote("");
    setTags([]);
    latest.current = { note: "", tags: [] };
    journal
      .getNote(puuid, matchId)
      .then((saved) => {
        if (!alive) return;
        const value = { note: saved?.note ?? "", tags: saved?.tags ?? [] };
        latest.current = value;
        setNote(value.note);
        setTags(value.tags);
        setLoaded(true);
        setStatus(saved ? "saved" : "idle");
      })
      .catch((err) => {
        if (!alive) return;
        setStatus("error");
        setError(errorMessage(err));
      });
    journal
      .listTags(puuid)
      .then((list) => {
        if (alive) setKnown(list.map((item) => item.tag));
      })
      .catch(() => {
        if (alive) setKnown([]);
      });
    return () => {
      alive = false;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
        void persist(target, latest.current, false);
      }
    };
  }, [puuid, matchId]);

  const schedule = (value: Draft) => {
    latest.current = value;
    setStatus("pending");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void persist({ puuid, matchId }, latest.current, true);
    }, DEBOUNCE_MS);
  };

  const changeNote = (value: string) => {
    setNote(value);
    schedule({ note: value, tags: latest.current.tags });
  };

  const changeTags = (next: string[]) => {
    setTags(next);
    schedule({ note: latest.current.note, tags: next });
  };

  const toggleTag = (tag: string) => {
    const current = latest.current.tags;
    changeTags(current.some((item) => sameTag(item, tag)) ? current.filter((item) => !sameTag(item, tag)) : [...current, tag]);
  };

  const addCustom = (event: FormEvent) => {
    event.preventDefault();
    const tag = custom.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_CHARS);
    setCustom("");
    if (!tag || latest.current.tags.some((item) => sameTag(item, tag))) return;
    changeTags([...latest.current.tags, tag]);
  };

  const options = [...SUGGESTED_TAGS];
  for (const tag of [...known, ...tags]) {
    if (!options.some((item) => sameTag(item, tag))) options.push(tag);
  }

  const disabled = !loaded;

  return (
    <section className="note-editor">
      <div className="row between wrap">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="section-title">Ta note</h2>
          <span className="hint">Ce que tu retiens du match, ton état, ton setup. Visible uniquement par toi.</span>
        </div>
        <SaveStatus status={status} />
      </div>

      <textarea
        className="input note-text"
        value={note}
        disabled={disabled}
        placeholder={status === "loading" ? "Chargement..." : "Par exemple : trop de peeks secs en défense, bonne communication avec le duo."}
        onChange={(event) => changeNote(event.target.value)}
        aria-label="Note du match"
      />

      <div className="stack" style={{ gap: 12 }}>
        <span className="label">Tags</span>
        <div className="chips">
          {options.map((tag) => {
            const active = tags.some((item) => sameTag(item, tag));
            return (
              <button
                key={tag}
                type="button"
                className={`chip${active ? " active" : ""}`}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <form className="note-tag-form" onSubmit={addCustom}>
          <input
            className="input"
            value={custom}
            maxLength={MAX_TAG_CHARS}
            disabled={disabled}
            placeholder="Ajouter un tag"
            onChange={(event) => setCustom(event.target.value)}
            aria-label="Nouveau tag"
          />
          <button type="submit" className="btn btn-secondary" disabled={disabled || !custom.trim()}>
            Ajouter
          </button>
        </form>
      </div>

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function SaveStatus({ status }: { status: Status }) {
  if (status === "saved") {
    return (
      <span className="note-status saved">
        <Icon name="check" size={14} strokeWidth={2.4} />
        Enregistré
      </span>
    );
  }
  if (status === "saving") return <span className="note-status">Enregistrement...</span>;
  if (status === "pending") return <span className="note-status">Modifications en cours</span>;
  if (status === "error") return <span className="note-status error">Non enregistré</span>;
  return null;
}
