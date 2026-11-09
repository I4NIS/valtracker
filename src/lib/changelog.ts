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
