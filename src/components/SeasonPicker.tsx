import { useEffect, useState } from "react";
import { api, type Season } from "../lib/api";
import { seasonLabel } from "../lib/assets";

type Props = {
  puuid: string;
  value: string | null | undefined;
  onChange: (season: string | null) => void;
};

export function SeasonPicker({ puuid, value, onChange }: Props) {
  const [seasons, setSeasons] = useState<Season[]>([]);

  useEffect(() => {
    api
      .getSeasons(puuid)
      .then((list) => {
        setSeasons(list);
        if (value === undefined) onChange(list[0]?.short ?? null);
      })
      .catch(() => onChange(null));
  }, [puuid]);

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
