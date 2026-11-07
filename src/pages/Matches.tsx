import { useEffect, useState } from "react";
import { MatchList } from "../components/MatchList";
import { api, errorMessage, type Account, type RecentMatch } from "../lib/api";

const PAGE = 20;

type Props = {
  account: Account;
  refreshKey: number;
  onOpen: (matchId: string) => void;
};

export function Matches({ account, refreshKey, onOpen }: Props) {
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getRecentMatches(account.puuid, PAGE, 0)
      .then((list) => {
        setMatches(list);
        setDone(list.length < PAGE);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [account.puuid, refreshKey]);

  const more = async () => {
    setLoading(true);
    try {
      const list = await api.getRecentMatches(account.puuid, PAGE, matches.length);
      setMatches((current) => [...current, ...list]);
      setDone(list.length < PAGE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content">
      <div className="stack">
        <h1 className="title">Matchs</h1>
        <p className="muted">Compétitif et Premier. Clique sur un match pour voir son détail et revoir tes morts.</p>
      </div>
      {error && <p className="form-error">{error}</p>}
      {matches.length === 0 && !loading ? (
        <div className="empty">Aucun match synchronisé pour l'instant.</div>
      ) : (
        <section className="stack" style={{ gap: 16 }}>
          <MatchList matches={matches} onOpen={onOpen} />
          {!done && (
            <button type="button" className="btn btn-secondary" style={{ alignSelf: "center" }} onClick={more} disabled={loading}>
              {loading ? "Chargement..." : "Afficher plus"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
