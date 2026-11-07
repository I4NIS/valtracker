import { useEffect } from "react";
import { seasonLabel } from "../lib/assets";
import { fmt } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { useMenu } from "./FilterPill";
import { Icon } from "./Icon";

type Props = {
  puuid: string;
  value: string | null | undefined;
  onChange: (season: string | null) => void;
};

const SHOWN = 2;

export function SeasonPicker({ puuid, value, onChange }: Props) {
  const query = useQuery(queries.seasons(puuid));
  const seasons = query.data ?? [];
  const recent = seasons.slice(0, SHOWN);
  const older = seasons.slice(SHOWN);
  const olderPicked = older.find((season) => season.short === value) ?? null;
  const { open, setOpen, root } = useMenu();
  const olderLabel = t("Actes précédents", "Earlier acts");

  useEffect(() => {
    if (value !== undefined) return;
    if (query.data) onChange(query.data[0]?.short ?? null);
    else if (query.error) onChange(null);
  }, [value, query.data, query.error]);

  const pick = (season: string | null) => {
    setOpen(false);
    if (season !== value) onChange(season);
  };

  return (
    <div className="chips" role="group" aria-label={t("Acte", "Act")}>
      {recent.map((season) => (
        <button
          key={season.short}
          type="button"
          className={`chip${value === season.short ? " active" : ""}`}
          onClick={() => pick(season.short)}
        >
          {seasonLabel(season.short)}
        </button>
      ))}
      <button type="button" className={`chip${value === null ? " active" : ""}`} onClick={() => pick(null)}>
        {t("Global", "All time")}
      </button>
      {older.length > 0 && (
        <div className="filter-pill" ref={root}>
          <button
            type="button"
            className={`chip${olderPicked ? " active" : " season-more"}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={olderPicked ? undefined : olderLabel}
            title={olderPicked ? undefined : olderLabel}
            onClick={() => setOpen(!open)}
          >
            {olderPicked ? (
              <>
                {seasonLabel(olderPicked.short)}
                <Icon name="chevron" size={14} strokeWidth={2} />
              </>
            ) : (
              "..."
            )}
          </button>
          {open && (
            <div className="filter-menu" role="listbox" aria-label={olderLabel}>
              {older.map((season) => (
                <button
                  key={season.short}
                  type="button"
                  role="option"
                  aria-selected={season.short === value}
                  onClick={() => pick(season.short)}
                >
                  <span className="filter-menu-name">{seasonLabel(season.short)}</span>
                  <span className="faint">{fmt(season.matches)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
