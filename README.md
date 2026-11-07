<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" alt="Logo Valtracker">
</p>

<h1 align="center">Valtracker</h1>

<p align="center">
  Suivi de performances Valorant pour Windows.<br>
  Tes stats, tes matchs et l'analyse de chacune de tes morts. Pas de conseils, juste les faits.
</p>

<p align="center">
  <a href="https://github.com/I4NIS/valtracker/releases/latest/download/Valtracker-setup.exe"><img alt="Télécharger pour Windows" src="https://img.shields.io/badge/T%C3%A9l%C3%A9charger-Windows%20.exe-FF4655?style=for-the-badge"></a>
</p>

<p align="center">
  <img alt="Dernière version" src="https://img.shields.io/github/v/release/I4NIS/valtracker?label=version&color=0E1116">
  <img alt="Statut" src="https://img.shields.io/badge/statut-en%20d%C3%A9veloppement-FF4655">
  <img alt="Plateforme" src="https://img.shields.io/badge/plateforme-Windows%2010%20%7C%2011-0E1116">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-B7410E">
</p>

## Pourquoi Valtracker

Les trackers en ligne donnent des chiffres. Valtracker va plus loin sur un point précis : comprendre où et pourquoi tu meurs. Chaque match est analysé mort par mort, à partir des positions de tous les joueurs au moment du kill, pour faire ressortir tes défauts récurrents.

## Fonctionnalités

**Statistiques**
- Aperçu de l'acte ou global : rang, RR, ACS, dégâts par round, K/D, KAD, headshot, win rate.
- Filtres sur l'accueil : map, agent, rôle, 7 ou 30 derniers jours, solo ou en groupe.
- Comparaison de chaque statistique avec la moyenne de tes lobbys.
- Tes défauts du moment sur tes 20 derniers matchs : morts non tradées, morts isolé, first deaths.

**Analyse des matchs**
- Score sur 100 pour chacun des 10 joueurs, calculé selon le rôle de l'agent.
- Placement, badges, niveau de ton équipe et RR gagné ou perdu.
- Timeline des rounds avec l'économie des deux équipes.
- Détail de chaque round : toutes les actions dans l'ordre, issue, cérémonie et économie des 10 joueurs.
- Défauts détectés à chaque mort : mort non tradée, joueur isolé, first death, full buy perdu, même spot répété.
- Seuils d'analyse réglables dans les paramètres : fenêtre de trade, distance d'isolement, full buy, morts au même spot.
- Revue guidée : chaque mort rejouée sur la minimap avec la position de tous les joueurs.

**Heatmaps**
- Tes morts, tes kills et la position de tes tueurs, par map.
- Filtres par côté et par moment du round, avec le nom officiel des zones.

**Agents, maps, armes et duels**
- Stats par agent et par rôle, avec le détail de chaque agent : ouvertures et résultats par map.
- Win rate, RR net, attaque et défense, plants par site, pistols et retakes sur chaque map.
- Kills par arme, distance des duels, répartition tête, corps, jambes et armes qui te tuent.
- Duels d'ouverture, clutchs de 1v1 à 1v5, matchups contre chaque agent, distance des duels et rivaux. Un clic sur un clutch ouvre le match au round concerné.
- Visuels du jeu partout : armes, portraits d'agents, capacités, maps.

**Images récap**
- Récap d'un match, de plusieurs matchs choisis, d'une période, de ta dernière session ou d'un acte complet, en image 1600x900.
- Un menu d'export accessible depuis la barre du haut, avec l'aperçu de l'image avant de l'exporter.
- Le récap d'acte ajoute des stats insolites : temps de jeu, balles dans les pieds, aces, plus long kill, némésis.
- Un clic copie l'image, prête à coller sur Discord. Le bouton Télécharger l'enregistre ensuite dans ton dossier Téléchargements.

**Journal**
- Une note et des tags sur chaque match.
- Tes résultats avec et sans chaque tag.
- Favoris : un match, un round ou une de tes morts, en un clic sur l'étoile, puis retrouvés dans le journal.

**Progression**
- Courbe de RR, jauge de forme, projection de rang.
- Détection du tilt selon l'heure et les séries de défaites.
- Records de la période.

**Confort**
- Premier lancement guidé en trois étapes, puis une visite de l'application, relançable depuis les paramètres.
- Synchronisation automatique au lancement puis toutes les 10 minutes, en remontant le plus loin possible dans ton historique compétitif.
- Icône dans la barre des tâches : fermer la fenêtre la réduit et la synchro continue. Pas de démarrage avec Windows.
- Notification Windows après l'analyse d'un nouveau match, désactivable dans les paramètres.
- Export et import de la base locale depuis les paramètres.
- Pages instantanées : les statistiques sont précalculées au lancement et après chaque synchro.
- Recherche rapide avec Ctrl+K : pages, actions et matchs.
- Plusieurs comptes Riot, avec une vue combinée de tous tes comptes sur l'accueil et les matchs.
- Thème sombre et clair.
- Mises à jour proposées au lancement et installées en un clic.

**À venir**
- Version anglaise.

## Ce que Valtracker ne fait pas

Valtracker ne lit jamais le jeu ni le client Valorant, et ne tourne pas en parallèle de tes parties. Toutes les données viennent de l'API HenrikDev, une fois les matchs terminés. Rien n'est injecté, rien n'est lu en mémoire.

## Installation

**[Télécharger Valtracker pour Windows](https://github.com/I4NIS/valtracker/releases/latest/download/Valtracker-setup.exe)**, puis lance le fichier. Aucun droit administrateur n'est nécessaire. Toutes les versions sont listées dans l'onglet [Releases](https://github.com/I4NIS/valtracker/releases).

À chaque lancement, Valtracker vérifie s'il existe une nouvelle version et propose de l'installer en un clic.

Au premier lancement, Valtracker demande :
1. ton Riot ID, par exemple `Pseudo#TAG` ;
2. ta région ;
3. une clé API HenrikDev, gratuite, à créer sur le [tableau de bord HenrikDev](https://api.henrikdev.xyz/dashboard/).

Tant que l'application n'est pas signée, Windows peut afficher un avertissement SmartScreen. Clique sur « Informations complémentaires » puis « Exécuter quand même ».

## Développement

### Prérequis

- [Node.js](https://nodejs.org/) 20 ou plus récent
- [Rust](https://www.rust-lang.org/tools/install) stable, installé avec rustup
- [Build Tools Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) avec la charge de travail « Développement Desktop en C++ »
- WebView2, déjà présent sur Windows 10 et 11

### Lancer en mode développement

```bash
npm install
npm run tauri dev
```

La première compilation Rust prend quelques minutes, les suivantes sont rapides.

### Construire l'installateur

```bash
npm run tauri build
```

L'installateur est généré dans `src-tauri/target/release/bundle/nsis/`.

### Publier une nouvelle version

1. Change le numéro de version dans `package.json`. L'application le reprend automatiquement.
2. Commite, puis crée et pousse un tag :

```bash
git tag v0.2.0
git push origin v0.2.0
```

Le workflow GitHub Actions compile l'installateur, le signe, publie la release avec `Valtracker-setup.exe` et le fichier `latest.json` utilisé par la mise à jour automatique.

Le dépôt doit contenir le secret `TAURI_SIGNING_PRIVATE_KEY` (clé privée de signature des mises à jour), et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` si la clé est protégée par un mot de passe.

## Architecture

| Dossier | Rôle |
| --- | --- |
| `src/` | Interface en React et TypeScript |
| `src-tauri/` | Cœur en Rust : synchronisation avec l'API, base SQLite locale, calcul des statistiques et analyse des morts |

Les données sont stockées en local dans une base SQLite. Le détail complet d'un match n'étant disponible que pour les matchs récents, chaque synchronisation l'enregistre immédiatement.

## Sources de données

- [HenrikDev API](https://docs.henrikdev.xyz) : compte, rang, historique de RR et matchs détaillés.
- [valorant-api.com](https://valorant-api.com) : minimaps, zones des maps, icônes des agents, des armes et des rangs.

## Mentions légales

Valtracker n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ni de quiconque officiellement impliqué dans la production ou la gestion des propriétés de Riot Games. Riot Games, Valorant et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.
