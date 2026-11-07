import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { Icon, type IconName } from "./Icon";
import type { TourTarget } from "./Shell";

type Step = {
  target: TourTarget | null;
  icon: IconName;
  title: string;
  text: string;
};

const steps = (): Step[] => [
  {
    target: null,
    icon: "arrowRight",
    title: t("Bienvenue dans Valtracker", "Welcome to Valtracker"),
    text: t(
      "Une visite rapide pour savoir où trouver quoi. Tu pourras la relancer à tout moment depuis les paramètres.",
      "A quick tour of where everything is. You can replay it anytime from the settings.",
    ),
  },
  {
    target: "home",
    icon: "home",
    title: t("Accueil", "Home"),
    text: t(
      "Ton rang, ton acte et tes statistiques principales, comparées à celles des joueurs de tes lobbys.",
      "Your rank, your Act and your key stats, compared with the players in your lobbies.",
    ),
  },
  {
    target: "matches",
    icon: "matches",
    title: t("Matchs", "Matches"),
    text: t(
      "Chaque match en détail : le score sur 100 des dix joueurs, la timeline des rounds et les défauts détectés.",
      "Every match in detail: the score out of 100 for all ten players, the round timeline and the detected flaws.",
    ),
  },
  {
    target: "heatmaps",
    icon: "heatmaps",
    title: t("Heatmaps", "Heatmaps"),
    text: t(
      "Où tu meurs, où tu tues et d'où on te tue, map par map, avec le nom des zones.",
      "Where you die, where you get kills and where you get killed from, map by map, with callout names.",
    ),
  },
  {
    target: "progress",
    icon: "progress",
    title: t("Progression", "Progression"),
    text: t(
      "Ta courbe de RR, ta forme du moment, ta projection de rang et l'effet du tilt sur tes performances.",
      "Your RR curve, your current form, your rank projection and how tilt affects your performance.",
    ),
  },
  {
    target: "sync",
    icon: "sync",
    title: t("Synchro automatique", "Automatic sync"),
    text: t(
      "Tes matchs arrivent tout seuls au lancement puis toutes les 10 minutes. Rien n'est lu dans le jeu : tout vient de l'API HenrikDev, une fois tes matchs terminés.",
      "Your matches come in on their own at launch, then every 10 minutes. Nothing is read from the game: everything comes from the HenrikDev API, once your matches are over.",
    ),
  },
  {
    target: "settings",
    icon: "settings",
    title: t("Paramètres", "Settings"),
    text: t(
      "Change ta clé API, ajoute d'autres comptes, passe en thème clair ou relance cette visite.",
      "Change your API key, add more accounts, switch to the light theme or replay this tour.",
    ),
  },
];

type Props = {
  onTarget: (target: TourTarget | null) => void;
  onClose: () => void;
};

export function Tour({ onTarget, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [list] = useState(steps);
  const step = list[index];
  const last = index === list.length - 1;

  useEffect(() => {
    onTarget(step.target);
  }, [step, onTarget]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      <div className="row between">
        <span className="tour-icon">
          <Icon name={step.icon} size={18} strokeWidth={2} />
        </span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Fermer la visite", "Close the tour")}>
          <Icon name="close" size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="stack">
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <p className="hint">{step.text}</p>
      </div>
      <div className="row between">
        <div className="tour-dots" aria-label={t(`Étape ${index + 1} sur ${list.length}`, `Step ${index + 1} of ${list.length}`)}>
          {list.map((item, i) => (
            <span key={item.title} className={i === index ? "active" : undefined} />
          ))}
        </div>
        <div className="row">
          {index > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => setIndex(index - 1)}>
              {t("Précédent", "Back")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
          >
            {last ? t("C'est parti", "Let's go") : t("Suivant", "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
