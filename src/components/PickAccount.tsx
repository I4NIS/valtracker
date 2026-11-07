import type { Account } from "../lib/api";
import { t } from "../lib/i18n";
import { RankBadge } from "./RankBadge";

type Props = {
  accounts: Account[];
  onPick: (puuid: string) => void;
};

export function PickAccount({ accounts, onPick }: Props) {
  return (
    <div className="content">
      <div className="empty stack" style={{ gap: 16, alignItems: "center" }}>
        <span>{t("Choisis un compte pour voir cette page.", "Pick an account to view this page.")}</span>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          {accounts.map((account) => (
            <button key={account.puuid} type="button" className="btn btn-secondary" onClick={() => onPick(account.puuid)}>
              <RankBadge tier={account.tier} size={24} />
              {account.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
