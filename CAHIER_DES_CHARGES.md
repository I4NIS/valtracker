# Valtracker : cahier des charges

Application Windows de suivi de performances Valorant, qui montre tes défauts de façon factuelle, sans donner de conseils.

## Principes d'interface
- Ultra simple et ergonomique : on doit avoir envie de l'ouvrir. Propre, belle, pas « vibecodée ».
- Pas de conseils : l'app montre les défauts et les chiffres, c'est toi qui en tires les conclusions.
- Peu d'éléments par écran, une hiérarchie claire, le détail seulement quand on le demande.

## Identité visuelle (validée sur la maquette)
- Logo : « Facettes », un V plié en deux plans (rouge vif #FF4655 et rouge sombre #A61E2B ; en clair #D2283A et #8A1621). Icône d'application : V blanc sur fond rouge.
- Couleur principale : rouge, #FF4655 en thème sombre, #D2283A en thème clair. Elle sert au logo, aux boutons, à l'onglet actif et à la barre de RR.
- Couleurs des données : bleu pour les points forts et les victoires, orange pour les défauts et les défaites, or pour les meilleurs scores.
- Thème sombre et thème clair, bascule par un bouton soleil/lune.
- Style d'app moderne (inspiration Spotify, Notion, Apple) :
  - coque en deux panneaux arrondis (barre latérale et contenu) sur un fond plus sombre ;
  - barre latérale groupée (Général, Analyse, Perso), icône active en rouge, compte et paramètres en bas ;
  - recherche en pilule centrée en haut, boutons ronds pour la synchro et le thème ;
  - une seule typo, Inter, grands titres resserrés et gros chiffres ;
  - boutons et filtres en pilules, onglets en sélecteur segmenté ;
  - listes façon playlist (numéro, image, titre, infos à droite), peu de cadres.
- Badges en texte simple à côté du pseudo, sans pastille colorée.
- Insignes de rang officiels, récupérés sur valorant-api.com à partir du rang donné par HenrikDev.

## Sources de données
- **HenrikDev API** (`https://api.henrikdev.xyz`) : compte, rang, historique RR, matchs détaillés v4. Clé dans l'en-tête `Authorization`. Limite constatée : 30 requêtes/min ; chaque match non mis en cache coûte +1.
- **valorant-api.com** (sans clé) : minimaps PNG, coefficients de conversion des coordonnées, callouts, icônes agents et armes.
- Le détail complet d'un match n'est disponible que pour les matchs récents : tout est stocké en local dès la synchro.

## Comptes et synchro
- Plusieurs comptes Riot (Riot ID + région), clé API modifiable dans les paramètres.
- Modes suivis : Compétitif et Premier.
- Synchro au lancement, toutes les 10 min tant que l'app est ouverte, et par un bouton.
- On ne garde que les matchs avec le détail complet (pas de stats résumées des vieux actes).

## Écran principal et stats
- Reproduit l'aperçu de tracker.gg : rang, niveau, V/D, ADR, K/D, HS%, Win%, KAST, DDΔ/round, kills, morts, assists, ACS, KAD, kills/round, first bloods, flawless, aces, clutchs, multi-kills.
- Les « Top X % » sont remplacés par deux comparaisons : avec les 9 autres joueurs des lobbys, et avec ta propre moyenne.
- Filtres : Global / Acte, map, agent, rôle, période, solo ou en groupe.
- Accueil, en plus des stats principales : carte du dernier match (score /100, erreurs principales), bilan de la session en cours, tes 3 défauts principaux du moment.
- Plusieurs comptes : stats de chaque compte séparées, plus une vue combinée.
- Onglets : Aperçu, Matchs, Agents (page complète par agent), Maps, Armes, Encounters.
- Graphiques d'évolution (RR, ACS, K/D, HS%, ADR, KAST, % de first deaths).

## Analyse d'une game (automatique à chaque nouveau match)
- Erreurs détectées à chaque mort :
  - trades : mort pas tradée, coéquipier pas vengé ;
  - positionnement : isolé, pris de dos ou de côté, mort au même spot ;
  - first death ;
  - éco et post-plant.
- Seuils réglables dans les paramètres.
- Replay 2D du round sur la minimap : position des 10 joueurs à chaque kill.

## Heatmaps par map
- Morts et kills, séparées attaque / défense, filtrables par phase du round, avec le nom des zones.

## Défauts détectés (pas de conseils)
- Constats factuels et neutres, sans recommandation (ex : « 6 morts isolées à Hookah », pas « joue avec ton duo »).
- Bilans par match, par session, par semaine et par acte.
- Après un match : les 3 défauts principaux en avant, le reste dépliable.
- Revue guidée après chaque match : les morts une par une, la pire en premier (replay 2D et défaut détecté).
- Détection du tilt (défaites d'affilée, heure, longueur de session).
- Pas de système d'objectifs.

## Technique
- Rust + Tauri, base SQLite locale.
- Installateur Windows avec mises à jour automatiques via GitHub Releases.
- Interface en FR et EN, thème sombre et clair.
- Icône dans la barre des tâches : fermer la fenêtre la réduit, la synchro continue. Pas de démarrage avec Windows, pas de mode streamer.
- Export / import de la base.
- Rust est à installer sur le PC de dev (rustup).

## Fonctionnalités reprises d'invade.lol (LoL) adaptées à Valorant
On s'inspire de ses fonctionnalités, pas de son style visuel.
- Score /100 pour chacun des 10 joueurs, comparé au lobby et au rang, avec le détail du calcul.
- Placement (MVP, ACE, 3e…) et badges : plus de dégâts, meilleur clutcheur, first bloods.
- Niveau de l'équipe : bonne, moyenne ou mauvaise.
- Timeline du match round par round : crédits, kills, plants, momentum.
- Jauge de forme sur la page Progression : moyenne des 20 derniers scores, du rouge au bleu, dorée au-dessus de 80.
- Le score /100 est calculé selon le rôle joué (Duelist, Initiator, Sentinel, Controller).
- Comparaison à un rang cible, par défaut le rang au-dessus du tien, calculée sur les joueurs de ce rang croisés dans tes games.
- Écartés : scouting en sélection d'agents, enregistrement de clips.
- Aucune interaction avec le jeu : pas d'API locale du client Valorant, pas de données en direct pendant une partie. Les données viennent uniquement de HenrikDev, après les matchs.
- Impossibles avec Valorant : overlay de stats en direct, probabilités de victoire du draft.

## Fonctionnalités supplémentaires
**Stats par type de round**
- Pistols et round suivant.
- Eco, force buy, full buy, conversion des anti-eco.
- Post-plant et retake.
- Attaque vs défense, par map.

**Duels**
- Opening duels : entries par map et par zone.
- Clutchs 1v1 à 1v5 : tentés, gagnés, où, avec quelle arme.
- Matchups contre chaque agent adverse.
- Temps de survie moyen dans le round.
- Duels gagnés et perdus selon la distance.

**Joueurs**
- Duos : win rate et stats avec chaque ami.
- Comparaison côte à côte avec un ami.
- Recherche de n'importe quel Riot ID.
- Niveau moyen des lobbys, alliés vs ennemis.

**Rang**
- Projection (« Ascendant 2 dans ~12 games »).
- RR moyen par victoire et par défaite.
- Records perso.
- Bilan de session.

**Méta** (calculée sur les joueurs de tes games stockées)
- Tier list des agents à ton rang.
- Tes stats par agent sur chaque map, pour comparer.
- Map pool : forces et faiblesses.
- Spots préférés par côté et par map.

**Analyse complémentaire**
- Utilisation des sorts : ult gardée, mort avec des sorts non utilisés (nombre par round, pas le moment exact).
- Coordination d'achat avec l'équipe.
- Probabilité de victoire de chaque round selon l'éco et les joueurs en vie, pour repérer les rounds jetés.
- Ligne tueur → victime sur le replay, heatmap des positions des tueurs.

**Outils**
- Palette Ctrl+K.
- Favoris : match, round, mort.
- Notification Windows après l'analyse d'un nouveau match.
- Export en image d'un bilan de match ou de semaine.
- Journal : notes et tags sur les matchs, comparaison avant/après un tag.

**Écarté** : classement EU et profils des pros.

## Dépôt
https://github.com/I4NIS/valtracker (branche `main`)

## Prochaine étape
Maquette de l'application avant tout code, avec une page séparée de propositions de logos.

## V1
Tout ce qui est listé ici. Pas d'IA ni de conseils.
