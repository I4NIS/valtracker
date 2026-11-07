<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" alt="Logo Valtracker">
</p>

<h1 align="center">Valtracker</h1>

<p align="center">
  Suivi de performances Valorant pour Windows.<br>
  Tes stats, tes matchs et l'analyse de chacune de tes morts. Pas de conseils, juste les faits.
</p>

<p align="center">
  <img alt="Statut" src="https://img.shields.io/badge/statut-en%20d%C3%A9veloppement-FF4655">
  <img alt="Plateforme" src="https://img.shields.io/badge/plateforme-Windows%2010%20%7C%2011-0E1116">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-B7410E">
</p>

## Pourquoi Valtracker

Les trackers en ligne donnent des chiffres. Valtracker va plus loin sur un point précis : comprendre où et pourquoi tu meurs. Chaque match est analysé mort par mort, à partir des positions de tous les joueurs au moment du kill, pour faire ressortir tes défauts récurrents.

## Fonctionnalités prévues pour la V1

**Statistiques**
- Aperçu de l'acte ou global : rang, RR, ACS, dégâts par round, K/D, headshot, KAST, DDΔ, first bloods, clutchs.
- Comparaison avec tes lobbys, avec tes 20 derniers matchs ou avec un rang cible.
- Filtres par acte, map, agent, rôle, période, solo ou en groupe.
- Pages Agents, Maps, Armes et Duels.

**Analyse des matchs**
- Score sur 100 pour chacun des 10 joueurs, calculé selon le rôle.
- Timeline des rounds avec l'économie des deux équipes.
- Défauts détectés à chaque mort : mort non tradée, joueur isolé, first death, full buy perdu, même spot répété.
- Revue guidée : chaque mort rejouée sur la minimap avec la position de tous les joueurs.

**Heatmaps**
- Tes morts, tes kills et la position de tes tueurs, par map.
- Filtres par côté et par moment du round, avec le nom officiel des zones.

**Progression**
- Courbe de RR, jauge de forme, projection de rang.
- Détection du tilt selon l'heure et les séries de défaites.
- Records personnels et bilans de session.

**Confort**
- Synchronisation automatique au lancement puis toutes les 10 minutes.
- Plusieurs comptes Riot, thème sombre et clair, français et anglais.
- Mises à jour automatiques.

## Ce que Valtracker ne fait pas

Valtracker ne lit jamais le jeu ni le client Valorant, et ne tourne pas en parallèle de tes parties. Toutes les données viennent de l'API HenrikDev, une fois les matchs terminés. Rien n'est injecté, rien n'est lu en mémoire.

## Installation

Les versions publiées seront disponibles dans l'onglet [Releases](https://github.com/I4NIS/valtracker/releases).

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

L'installateur est généré dans `src-tauri/target/release/bundle/`.

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
