import { useEffect } from "react";
import { seasonLabel } from "../lib/assets";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";

type Props = {
  puuid: string;
  value: string | null | undefined;
  onChange: (season: string | null) => void;
};

export function SeasonPicker({ puuid, value, onChange }: Props) {
  const query = useQuery(queries.seasons(puuid));
  const seasons = query.data ?? [];

  useEffect(() => {
    if (value !== undefined) return;
    if (query.data) onChange(query.data[0]?.short ?? null);
    else if (query.error) onChange(null);
  }, [value, query.data, query.error]);

  return (
    <div className="chips" role="group" aria-label="Période">
      {seasons.map((season) => (
        <button
          key={season.short}
          type="button"
          className={`chip${value === season.short ? " active" : ""}`}
          onClick={() => onChange(season.short)}
        >
          {seasonLabel(season.short)}
        </button>
      ))}
      <button type="button" className={`chip${value === null ? " active" : ""}`} onClick={() => onChange(null)}>
        Global
      </button>
    </div>
  );
}
