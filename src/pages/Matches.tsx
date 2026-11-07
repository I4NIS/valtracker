import { useEffect, useState } from "react";
import { type ExtraFilters, hasExtra, MatchFilters, NO_EXTRA } from "../components/MatchFilters";
import { MatchList } from "../components/MatchList";
import { SeasonPicker } from "../components/SeasonPicker";
import type { Account } from "../lib/api";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { ALL_ACCOUNTS, queries } from "../lib/queries";

const PAGE = 20;

type Props = {
  account: Account;
  accounts: Account[] | null;
  refreshKey: number;
  onOpen: (matchId: string, round?: number, puuid?: string) => void;
};

type View = { puuid: string; season: string | null; extra: ExtraFilters; count: number };

const fresh = (puuid: string): View => ({ puuid, season: null, extra: NO_EXTRA, count: PAGE });

let remembered: View | null = null;

export function Matches({ account, accounts, onOpen }: Props) {
  const puuid = accounts ? ALL_ACCOUNTS : account.puuid;
  const [view, setView] = useState<View>(() => (remembered?.puuid === puuid ? remembered : fresh(puuid)));
  if (view.puuid !== puuid) setView(fresh(puuid));
  const { season, extra, count } = view;
  const query = useQuery(queries.recent(puuid, count, 0, { ...extra, season }));
  const matches = query.data ?? [];
  const loading = query.pending;
  const error = query.error;
  const done = !loading && matches.length < count;
  const filtered = season !== null || hasExtra(extra);

  useEffect(() => {
    remembered = view;
  }, [view]);

  const more = () => setView({ ...view, count: count + PAGE });

  return (
    <div className="content">
      <div className="stack">
        <h1 className="title">{t("Matchs", "Matches")}</h1>
        <p className="muted">
          {accounts
            ? t("Les matchs compétitifs de tous tes comptes.", "Competitive matches from all your accounts.")
            : t("Tes matchs compétitifs.", "Your competitive matches.")}{" "}
          {t("Clique sur un match pour voir son détail et revoir tes morts.", "Click a match to see its details and review your deaths.")}
        </p>
      </div>
      <div className="filter-bar">
        <SeasonPicker puuid={puuid} value={season} onChange={(next) => setView({ ...view, season: next, count: PAGE })} />
        <MatchFilters puuid={puuid} value={extra} onChange={(next) => setView({ ...view, extra: next, count: PAGE })} />
      </div>
      {error && <p className="form-error">{error}</p>}
      {matches.length === 0 && !loading ? (
        <div className="empty">
          {filtered
            ? t("Aucun match ne correspond à ces filtres.", "No matches fit these filters.")
            : t("Aucun match synchronisé pour l'instant.", "No matches synced yet.")}
        </div>
      ) : (
        <section className="stack" style={{ gap: 16 }}>
          <MatchList matches={matches} accounts={accounts} onOpen={(matchId, owner) => onOpen(matchId, undefined, owner)} />
          {!done && (
            <button type="button" className="btn btn-secondary" style={{ alignSelf: "center" }} onClick={more} disabled={loading}>
              {loading ? t("Chargement...", "Loading...") : t("Afficher plus", "Show more")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
