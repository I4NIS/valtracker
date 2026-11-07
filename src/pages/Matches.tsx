import { useEffect, useState } from "react";
import { MatchList } from "../components/MatchList";
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

let shown = PAGE;

export function Matches({ account, accounts, onOpen }: Props) {
  const [count, setCount] = useState(shown);
  const query = useQuery(queries.recent(accounts ? ALL_ACCOUNTS : account.puuid, count));
  const matches = query.data ?? [];
  const loading = query.pending;
  const error = query.error;
  const done = !loading && matches.length < count;

  useEffect(() => {
    shown = count;
  }, [count]);

  const more = () => setCount((current) => current + PAGE);

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
      {error && <p className="form-error">{error}</p>}
      {matches.length === 0 && !loading ? (
        <div className="empty">{t("Aucun match synchronisé pour l'instant.", "No matches synced yet.")}</div>
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
