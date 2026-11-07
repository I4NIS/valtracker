import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import type { TourTarget } from "./Shell";

type Step = {
  target: TourTarget | null;
  icon: IconName;
  title: string;
  text: string;
};

const STEPS: Step[] = [
  {
    target: null,
    icon: "arrowRight",
    title: "Bienvenue dans Valtracker",
    text: "Une visite rapide pour savoir où trouver quoi. Tu pourras la relancer à tout moment depuis les paramètres.",
  },
  {
    target: "home",
    icon: "home",
    title: "Accueil",
    text: "Ton rang, ton acte et tes statistiques principales, comparées à celles des joueurs de tes lobbys.",
  },
  {
    target: "matches",
    icon: "matches",
    title: "Matchs",
    text: "Chaque match en détail : le score sur 100 des dix joueurs, la timeline des rounds et les défauts détectés.",
  },
  {
    target: "heatmaps",
    icon: "heatmaps",
    title: "Heatmaps",
    text: "Où tu meurs, où tu tues et d'où on te tue, map par map, avec le nom des zones.",
  },
  {
    target: "progress",
    icon: "progress",
    title: "Progression",
    text: "Ta courbe de RR, ta forme du moment, ta projection de rang et l'effet du tilt sur tes performances.",
  },
  {
    target: "sync",
    icon: "sync",
    title: "Synchro automatique",
    text: "Tes matchs arrivent tout seuls au lancement puis toutes les 10 minutes. Rien n'est lu dans le jeu : tout vient de l'API HenrikDev, une fois tes matchs terminés.",
  },
  {
    target: "settings",
    icon: "settings",
    title: "Paramètres",
    text: "Change ta clé API, ajoute d'autres comptes, passe en thème clair ou relance cette visite.",
  },
];

type Props = {
  onTarget: (target: TourTarget | null) => void;
  onClose: () => void;
};

export function Tour({ onTarget, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

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
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer la visite">
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
        <div className="tour-dots" aria-label={`Étape ${index + 1} sur ${STEPS.length}`}>
          {STEPS.map((item, i) => (
            <span key={item.title} className={i === index ? "active" : undefined} />
          ))}
        </div>
        <div className="row">
          {index > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => setIndex(index - 1)}>
              Précédent
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
          >
            {last ? "C'est parti" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
