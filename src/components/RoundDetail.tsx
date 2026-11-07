import type { RoundEvent, RoundLine } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt } from "../lib/format";

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
  rounds: RoundLine[];
  selected: number;
  onSelect: (index: number) => void;
};

export function RoundDetail({ rounds, selected, onSelect }: Props) {
  const round = rounds[Math.min(selected, rounds.length - 1)];
  if (!round) return <div className="empty">Aucun round à afficher.</div>;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="round-picker" role="group" aria-label="Choisir un round">
        {rounds.map((item, index) => (
          <button
            type="button"
            key={item.number}
            className={`${item.won ? "won" : "lost"}${index === selected ? " active" : ""}`}
            onClick={() => onSelect(index)}
            aria-pressed={index === selected}
            title={`Round ${item.number}, ${item.won ? "gagné" : "perdu"}`}
          >
            {item.number}
          </button>
        ))}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <span className="review-title">
          Round {round.number}, {round.attack ? "attaque" : "défense"}
        </span>
        <span className="muted">
          <strong className={round.won ? "win" : "bad"}>{round.won ? "Gagné" : "Perdu"}</strong>, {round.result.toLowerCase()}
          {round.ceremony ? `, ${round.ceremony}` : ""}
        </span>
      </div>

      <div className="summary-grid">
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="section-title">Actions</h2>
          {round.events.length === 0 && <span className="faint">Aucune action enregistrée.</span>}
          <div className="events">
            {round.events.map((event, i) => (
              <EventRow key={i} event={event} />
            ))}
          </div>
        </section>

        <section className="stack" style={{ gap: 10 }}>
          <h2 className="section-title">Économie</h2>
          <div className="economy">
            {round.economy.map((line) => (
              <div key={line.name} className={`economy-row${line.me ? " me" : ""}`}>
                {agentIcon(line.agentId) ? <img src={agentIcon(line.agentId)} alt="" /> : <span />}
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <strong className={`ellipsis ${line.ally ? "ally-text" : "enemy-text"}`}>{line.name}</strong>
                  <span className="faint ellipsis" style={{ fontSize: 12 }}>
                    {line.weapon ?? "Arme de base"}
                    {line.armor ? `, ${ARMOR[line.armor] ?? line.armor}` : ""}
                  </span>
                </span>
                <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                  <strong>{fmt(line.loadout)}</strong>
                  <span className="faint" style={{ fontSize: 12 }}>
                    reste {fmt(line.remaining)}
                  </span>
                </span>
                <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                  <strong>{line.kills} kill{line.kills > 1 ? "s" : ""}</strong>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {fmt(line.damage)} dégâts
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
      {agentIcon(agentId) && <img src={agentIcon(agentId)} alt="" />}
      <strong className={me ? "me-text" : ally ? "ally-text" : "enemy-text"}>{me ? "Toi" : name}</strong>
    </span>
  );
}

function EventRow({ event }: { event: RoundEvent }) {
  return (
    <div className={`event${event.actorMe || event.targetMe ? " mine" : ""}`}>
      <span className="faint event-time">{clock(event.timeS)}</span>
      <Who name={event.actor} agentId={event.actorAgentId} ally={event.actorAlly} me={event.actorMe} />
      {event.kind === "kill" && event.target ? (
        <>
          <span className="faint">{event.weapon ?? "tue"}</span>
          <Who name={event.target} agentId={event.targetAgentId} ally={event.targetAlly} me={event.targetMe} />
        </>
      ) : (
        <span className="muted">
          {event.kind === "plant" ? `pose le spike${event.site ? ` sur ${event.site}` : ""}` : "désamorce le spike"}
        </span>
      )}
    </div>
  );
}
