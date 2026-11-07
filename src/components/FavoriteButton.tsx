import { useState } from "react";
import { favorites, isFavorite, type FavoriteKind } from "../lib/favorites";
import { t } from "../lib/i18n";
import { setQueryData, useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { Icon } from "./Icon";

type Props = {
  puuid: string;
  matchId: string;
  kind: FavoriteKind;
  roundIndex?: number | null;
  labeled?: boolean;
};

const TARGET: Record<FavoriteKind, string> = {
  match: "ce match",
  round: "ce round",
  death: "cette mort",
};

const TARGET_EN: Record<FavoriteKind, string> = {
  match: "this match",
  round: "this round",
  death: "this death",
};

export function FavoriteButton({ puuid, matchId, kind, roundIndex = null, labeled }: Props) {
  const query = queries.favorites(puuid);
  const { data } = useQuery(query);
  const [busy, setBusy] = useState(false);
  const active = isFavorite(data, matchId, kind, roundIndex);
  const title = active
    ? t(`Retirer ${TARGET[kind]} des favoris`, `Remove ${TARGET_EN[kind]} from favorites`)
    : t(`Ajouter ${TARGET[kind]} aux favoris`, `Add ${TARGET_EN[kind]} to favorites`);

  const toggle = () => {
    if (busy) return;
    setBusy(true);
    favorites
      .toggle(puuid, matchId, kind, roundIndex)
      .then((list) => setQueryData(query.key, list))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  if (labeled) {
    return (
      <button type="button" className={`btn btn-secondary fav-btn${active ? " active" : ""}`} onClick={toggle} aria-pressed={active} title={title}>
        <Icon name="star" size={16} strokeWidth={2} filled={active} />
        {active ? t("En favori", "Favorited") : t("Favori", "Favorite")}
      </button>
    );
  }

  return (
    <button type="button" className={`icon-btn fav-btn${active ? " active" : ""}`} onClick={toggle} aria-pressed={active} aria-label={title} title={title}>
      <Icon name="star" size={16} strokeWidth={2} filled={active} />
    </button>
  );
}
