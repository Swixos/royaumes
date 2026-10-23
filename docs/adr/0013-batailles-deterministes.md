# ADR-0013 - Batailles déterministes et capitaines pirates pilotés par une IA sans hasard

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le Donjon (ADR 0005) pilote ses monstres par une IA déterministe, alimentée par une graine
enregistrée dans le journal. La Flotte a besoin d'adversaires pour le joueur seul : les îles
pirates. Le cœur du jeu est une lecture de l'adversaire : choisir une tactique contre la posture
supposée du défenseur, dans un triangle où chaque tactique en bat une autre (règle 7).

Une bataille tranchée par le hasard rendrait cette lecture vaine, et rendrait les rapports
impossibles à vérifier par un test ou par le joueur. Un adversaire purement aléatoire ne
récompenserait aucun apprentissage.

## Décision

**Aucune bataille ne fait intervenir le hasard.** La force d'attaque vaut 10 par trirème,
multipliée par 1,5 si la tactique bat la posture, par 0,5 si elle est battue ; la flotte gagne si
sa force dépasse strictement la défense (`fight`, `domain/naval.ts`). La durée de traversée entre
deux villages et leur place sur la carte sont tirées d'un hachage de leurs identifiants (FNV-1a) :
elles ne changent jamais.

**Le capitaine pirate est une IA déterministe** (`domain/pirates.ts`) : il lit les tactiques que
l'attaquant a employées dans ses combats précédents contre les pirates, et tient la posture qui
bat la plus fréquente ; à égalité, ou sans historique, il tient l'abordage. Cet historique est
lu dans le modèle de lecture de la Flotte, à partir des raids dont la bataille a eu lieu.

**Une fonction d'aptitude protège cette propriété.** Le test « garde le domaine de la Flotte
déterministe : ni horloge, ni hasard » (`src/bootstrap/architecture.test.ts`) échoue si un
fichier du domaine de la Flotte appelle `Math.random`, `Date.now`, `new Date`,
`performance.now` ou `crypto`. Le domaine reçoit l'heure en paramètre, comme tous les domaines du
projet.

## Conséquences

### Positives

- Un rapport de bataille se vérifie à la main : l'interface affiche, avant le départ, la force
  obtenue contre chacune des trois postures possibles.
- Le capitaine pirate est un adversaire qu'on apprend : le joueur qui varie ses tactiques le bat,
  celui qui répète la même perd. Les tests de l'IA le démontrent sur des historiques fixés.
- La fonction d'aptitude rend la propriété visible et défendue : une évolution qui introduirait du
  hasard dans le domaine échoue à la vérification, au lieu de rendre les tests intermittents.

### Négatives

- Un joueur qui connaît son historique peut prévoir la posture du capitaine : l'île la plus faible
  devient facile à battre en alternant les tactiques. Le trésor quotidien (règle 12) limite le
  gain.
- La fonction d'aptitude est une recherche textuelle : elle ne voit pas un appel au hasard caché
  derrière une dépendance, mais le domaine n'en importe aucune (règle `pure-domain`).
- La place des villages sur la carte, tirée d'un hachage, peut faire se chevaucher deux îles ;
  l'interface les écarte à l'affichage.

## Alternatives écartées

- **Une graine par raid, comme le Donjon** : la bataille resterait rejouable, mais le joueur ne
  pourrait plus prévoir son issue, ce qui retirerait l'intérêt du triangle des tactiques.
- **Un capitaine qui choisit au hasard** : aucun apprentissage possible, et des tests
  intermittents.
- **Un capitaine qui lit la tactique du raid en cours** : il gagnerait toujours ; l'IA ne lit que
  le passé de l'attaquant.
- **Une règle de dependency-cruiser plutôt qu'un test** : l'horloge et le hasard ne sont pas des
  imports, mais des objets globaux ; dependency-cruiser ne peut pas les voir.

## Usage de l'IA générative

