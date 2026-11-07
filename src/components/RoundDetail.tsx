import "../styles/rounds.css";
import type { RoundEvent, RoundLine } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt } from "../lib/format";
import { useAgentCatalog, weaponArt, type Catalog } from "../lib/gameAssets";
import { t } from "../lib/i18n";
import { FavoriteButton } from "./FavoriteButton";
import { Art, KillMeans, SpikeGlyph } from "./GameArt";

const ARMOR: Record<string, string> = {
  "Heavy Armor": "Bouclier lourd",
  "Light Armor": "Bouclier léger",
  "Regen Shield": "Bouclier régénérant",
};

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

type Props = {
  puuid: string;
  matchId: string;
  rounds: RoundLine[];
  selected: number;
  onSelect: (index: number) => void;
};

export function RoundDetail({ puuid, matchId, rounds, selected, onSelect }: Props) {
  const index = Math.min(selected, rounds.length - 1);
  const round = rounds[index];
  const catalog = useAgentCatalog();
  if (!round) return <div className="empty">{t("Aucun round à afficher.", "No rounds to show.")}</div>;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="round-picker" role="group" aria-label={t("Choisir un round", "Pick a round")}>
        {rounds.map((item, index) => (
          <button
            type="button"
            key={item.number}
            className={`${item.won ? "won" : "lost"}${index === selected ? " active" : ""}`}
            onClick={() => onSelect(index)}
            aria-pressed={index === selected}
            title={t(`Round ${item.number}, ${item.won ? "gagné" : "perdu"}`, `Round ${item.number}, ${item.won ? "won" : "lost"}`)}
          >
            {item.number}
          </button>
        ))}
      </div>

      <div className="row between" style={{ alignItems: "flex-start", gap: 16 }}>
        <div className="stack" style={{ gap: 6, minWidth: 0 }}>
          <span className="review-title">
            Round {round.number}, {round.attack ? t("attaque", "attack") : t("défense", "defense")}
          </span>
          <span className="muted">
            <strong className={round.won ? "win" : "bad"}>{round.won ? t("Gagné", "Won") : t("Perdu", "Lost")}</strong>, {round.result.toLowerCase()}
            {round.ceremony ? `, ${round.ceremony}` : ""}
          </span>
        </div>
        <FavoriteButton puuid={puuid} matchId={matchId} kind="round" roundIndex={index} />
      </div>

      <div className="summary-grid">
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="section-title">{t("Actions", "Events")}</h2>
          {round.events.length === 0 && <span className="faint">{t("Aucune action enregistrée.", "No events recorded.")}</span>}
          <div className="events round-feed">
            {round.events.map((event, i) => (
              <EventRow key={i} event={event} catalog={catalog} />
            ))}
          </div>
        </section>

        <section className="stack" style={{ gap: 10 }}>
          <h2 className="section-title">{t("Économie", "Economy")}</h2>
          <div className="economy round-economy">
            {round.economy.map((line) => (
              <div key={line.name} className={`economy-row${line.me ? " me" : ""}`}>
                <Art src={agentIcon(line.agentId)} width={32} height={32} alt="" />
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <strong className={`ellipsis ${line.ally ? "ally-text" : "enemy-text"}`}>{line.name}</strong>
                  <span className="faint ellipsis" style={{ fontSize: 12 }}>
                    {line.weapon ?? t("Arme de base", "Starting weapon")}
                    {line.armor ? `, ${t(ARMOR[line.armor] ?? line.armor, line.armor)}` : ""}
                  </span>
                </span>
                <span className="round-economy-weapon">
                  {line.weaponId && <Art src={weaponArt(line.weaponId, "killstreamicon")} width={72} height={24} alt={line.weapon ?? ""} mono />}
                </span>
                <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                  <strong>{fmt(line.loadout)}</strong>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {t(`reste ${fmt(line.remaining)}`, `${fmt(line.remaining)} left`)}
                  </span>
                </span>
                <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                  <strong>
                    {line.kills} {t(`kill${line.kills > 1 ? "s" : ""}`, line.kills === 1 ? "kill" : "kills")}
                  </strong>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {t(`${fmt(line.damage)} dégâts`, `${fmt(line.damage)} damage`)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Who({ name, agentId, ally, me }: { name: string; agentId: string | null; ally: boolean; me: boolean }) {
  return (
    <span className="who">
      <Art src={agentIcon(agentId)} width={24} height={24} alt="" />
      <strong className={`ellipsis ${me ? "me-text" : ally ? "ally-text" : "enemy-text"}`}>{me ? t("Toi", "You") : name}</strong>
    </span>
  );
}

function EventRow({ event, catalog }: { event: RoundEvent; catalog: Catalog | null }) {
  const mine = event.actorMe || event.targetMe;
  if (event.kind === "kill" && event.target) {
    return (
      <div className={`event round-kill${mine ? " mine" : ""}`}>
        <span className="faint event-time">{clock(event.timeS)}</span>
        <span className="round-kill-actor">
          <Who name={event.actor} agentId={event.actorAgentId} ally={event.actorAlly} me={event.actorMe} />
        </span>
        <KillMeans
          weaponId={event.weaponId}
          weaponName={event.weapon}
          weaponKind={event.weaponKind}
          agentId={event.actorAgentId}
          catalog={catalog}
        />
        <span className="round-kill-target">
          <Who name={event.target} agentId={event.targetAgentId} ally={event.targetAlly} me={event.targetMe} />
        </span>
      </div>
    );
  }
  return (
    <div className={`event round-spike${mine ? " mine" : ""}`}>
      <span className="faint event-time">{clock(event.timeS)}</span>
      <SpikeGlyph size={20} className={event.kind === "defuse" ? "round-spike-defuse" : undefined} />
      <Who name={event.actor} agentId={event.actorAgentId} ally={event.actorAlly} me={event.actorMe} />
      <span className="muted">
        {event.kind === "plant"
          ? t(`pose le spike${event.site ? ` sur ${event.site}` : ""}`, `plants the Spike${event.site ? ` on ${event.site}` : ""}`)
          : t("désamorce le spike", "defuses the Spike")}
      </span>
    </div>
  );
}
