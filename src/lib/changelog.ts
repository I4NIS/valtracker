import type { Page } from "../components/Shell";
import { t } from "./i18n";

export type Change = {
  title: string;
  text: string;
  howTo?: string;
  page?: Page;
};

export type Release = {
  version: string;
  date: string;
  changes: Change[];
};

export const FIRST_TRACKED = "1.0.4";

export const CHANGELOG = (): Release[] => [
  {
    version: "1.1.0",
    date: "2026-11-11",
    changes: [
      {
        title: t("Prochaine map", "Next map"),
        text: t(
          "Un bouton sur l'accueil montre la map qui a le plus de chance de tomber à ta prochaine game, et la chance de chaque map en rotation, d'après les maps de tes dernières games.",
          "A home page button shows the map most likely to come up in your next game, and the chance of each map in rotation, based on the maps of your last games.",
        ),
        howTo: t("Accueil, bouton Prochaine map, à côté de Prochaine game.", "Home page, Next map button, next to Next game."),
        page: "home",
      },
      {
        title: t("Chance de victoire sur l'accueil", "Chance to win on the home page"),
        text: t(
          "Le bouton Prochaine game affiche directement ta chance de victoire estimée, calculée en arrière-plan avec ton dernier agent et ton groupe actuel.",
          "The Next game button shows your estimated chance to win right away, computed in the background with your last agent and your current group.",
        ),
        howTo: t("Ouvre le bouton pour changer la map, l'agent, le groupe ou les agents.", "Open the button to change the map, agent, group or agents."),
        page: "home",
      },
    ],
  },
  {
    version: "1.0.9",
    date: "2026-11-10",
    changes: [
      {
        title: t("Prochaine game", "Next game"),
        text: t(
          "Un bouton sur l'accueil estime ta chance de victoire à partir de la map, de ton agent, de ton groupe et des agents alliés et adverses, avec la fiabilité du modèle mesurée sur tes matchs. Il montre aussi ton taux de victoire dans des conditions pareilles : heure, jour, session, série et pause.",
          "A home page button estimates your chance to win from the map, your agent, your group and the allied and enemy agents, with the model's reliability measured on your matches. It also shows your win rate in similar conditions: hour, day, session, streak and break.",
        ),
        howTo: t("Accueil, bouton Prochaine game. Tous les choix sont facultatifs.", "Home page, Next game button. Every choice is optional."),
        page: "home",
      },
    ],
  },
  {
    version: "1.0.8",
    date: "2026-11-10",
    changes: [
      {
        title: t("Face à face dans les matchs", "Head to head in matches"),
        text: t(
          "Le résumé d'un match montre, pour chaque adversaire, combien de fois tu l'as tué, combien de fois il t'a tué et les dégâts échangés.",
          "A match summary shows, for each opponent, how many times you killed them, how many times they killed you and the damage traded.",
        ),
        howTo: t("Ouvre un match : la section est sous les tableaux des équipes.", "Open a match: the section is below the team tables."),
        page: "matches",
      },
    ],
  },
  {
    version: "1.0.7",
    date: "2026-11-09",
    changes: [
      {
        title: t("First kills et first deaths dans les matchs", "First kills and first deaths in matches"),
        text: t(
          "Le résumé d'un match affiche tes first kills et first deaths comparés au lobby, une colonne FK / FD pour chaque joueur et les rounds où tu as ouvert ou subi l'ouverture.",
          "A match summary shows your first kills and first deaths compared with the lobby, an FK / FD column for every player and the rounds you opened or were opened on.",
        ),
        howTo: t("Ouvre un match : FK et FD sont sous chaque round de la frise.", "Open a match: FK and FD sit under each round of the timeline."),
        page: "matches",
      },
    ],
  },
  {
    version: "1.0.6",
    date: "2026-11-09",
    changes: [
      {
        title: t("Les nouveautés à chaque mise à jour", "What's new after each update"),
        text: t(
          "Après une mise à jour, cette fenêtre liste ce qui a changé, avec un lien vers chaque nouveauté.",
          "After an update, this window lists what changed, with a link to each new feature.",
        ),
        howTo: t("Pour la revoir : Paramètres, Général, Version, Nouveautés.", "To see it again: Settings, General, Version, What's new."),
        page: "settings",
      },
    ],
  },
  {
    version: "1.0.5",
    date: "2026-11-09",
    changes: [
      {
        title: t("Tri par colonne", "Sort by column"),
        text: t(
          "Tous les tableaux se trient en cliquant sur le titre d'une colonne : matchs, équipes d'un match, armes, duels, patchs, zones d'une map.",
          "Every table sorts by clicking a column title: matches, match teams, weapons, duels, patches, map zones.",
        ),
        howTo: t("Un clic trie, un deuxième clic inverse l'ordre.", "One click sorts, a second click reverses the order."),
        page: "matches",
      },
      {
        title: t("Temps de jeu", "Play time"),
        text: t(
          "Le temps de jeu s'affiche pour chaque agent, chaque map et sur la période choisie à l'accueil.",
          "Play time shows for each agent, each map and for the period picked on the home page.",
        ),
        page: "agents",
      },
      {
        title: t("Total de matchs classés", "Total ranked matches"),
        text: t(
          "En Global, l'accueil affiche le nombre de matchs classés selon Riot à côté des matchs enregistrés dans Valtracker.",
          "In All time, the home page shows the ranked match count according to Riot next to the matches recorded in Valtracker.",
        ),
        howTo: t("Choisis Global au-dessus des statistiques de l'accueil.", "Pick All time above the home page stats."),
        page: "home",
      },
      {
        title: t("Où tu joues", "Where you play"),
        text: t(
          "Le détail d'une map montre les zones où tu es le plus souvent, en attaque et en défense, à partir de ta position à chaque kill, plant et défuse.",
          "A map's details show the zones where you are most often, on attack and defense, from your position at each kill, plant and defuse.",
        ),
        howTo: t("Ouvre une map : la section est sous la liste des zones.", "Open a map: the section is below the zone list."),
        page: "maps",
      },
      {
        title: t("RR plus fiable", "More reliable RR"),
        text: t(
          "Le RR du dernier match est récupéré après le match lui-même, avec un nouvel essai s'il manque encore. Les images exportées affichent le RR à côté du rang.",
          "The last match's RR is fetched after the match itself, with a retry if it is still missing. Exported images show the RR next to the rank.",
        ),
        page: "home",
      },
    ],
  },
  {
    version: "1.0.4",
    date: "2026-11-08",
    changes: [
      {
        title: t("Statistiques clés en tête des matchs", "Key stats at the top of matches"),
        text: t(
          "Le détail d'un match commence par K/D/A, HS, ADR, ACS, RR et score, comparés au lobby. La liste des matchs affiche le HS et l'ADR.",
          "A match's details start with K/D/A, HS, ADR, ACS, RR and score, compared with the lobby. The match list shows HS and ADR.",
        ),
        page: "matches",
      },
    ],
  },
];

function parts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function releasesSince(seen: string, current: string): Release[] {
  return CHANGELOG().filter((release) => compareVersions(release.version, seen) > 0 && compareVersions(release.version, current) <= 0);
}
