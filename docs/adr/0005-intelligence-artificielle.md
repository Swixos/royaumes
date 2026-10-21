# ADR-0005 - Intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le Donjon a besoin de comportements automatiques : des monstres dont la manière de choisir
leur cible dépend du niveau de difficulté de l'expédition, et des compagnons, héros pilotés
par l'ordinateur, qui permettent à un joueur de partir seul.

L'hébergement ne permet aucun processus permanent : aucune instance ne survit d'une requête
à l'autre, et aucune tâche de fond ne peut faire agir un personnage entre deux requêtes
(ADR 0004).

L'état d'une expédition est reconstruit à partir de ses événements (ADR 0002), et une
manche échue peut être calculée lors d'une simple lecture, sans être enregistrée
(ADR 0004). Tout calcul effectué lors de la résolution d'une manche doit donc donner le
même résultat, quels que soient le moment et l'instance qui l'effectuent.

## Décision

Les décisions de l'intelligence artificielle sont des fonctions pures du domaine du module
Donjon (`companion.ts`, `monster-strategies.ts`), appelées uniquement au moment de la
résolution d'une manche, dans `resolveRound`.

Elles ne tirent au sort qu'au moyen du générateur de la manche, dont la graine est dérivée
de la graine de l'expédition et du numéro de manche ; le compagnon ne tire rien au sort.

Leurs résultats, actions des compagnons comprises, sont enregistrés dans l'événement
`RoundResolved`, que `evolve` applique tels quels : la relecture du journal ne recalcule
aucune décision.

Le comportement des monstres est isolé derrière un port de stratégie (`MonsterStrategy`),
dont chaque niveau de difficulté fournit une mise en œuvre (`MONSTER_STRATEGIES`).

Un compagnon n'agit que si au moins un joueur a choisi une action pour la manche ; sinon,
il se défend, comme un joueur absent.

L'équilibre du jeu est mesuré par la simulation d'expéditions complètes
(`scripts/simulate-dungeon.ts`), et protégé par des tests statistiques
(`simulation.test.ts`).

## Conséquences

### Positives

- Aucune infrastructure n'est nécessaire : ni boucle de jeu, ni processus permanent, ni
  tâche de fond. L'intelligence artificielle s'exécute dans la requête qui résout la manche.
- Le résultat d'une manche reste indépendant du moment où il est calculé : une lecture et
  une commande affichent les mêmes décisions, et la relecture du journal redonne exactement
  le même état.
- Les décisions sont testables comme n'importe quelle fonction pure : par des tests exacts
  sur des situations choisies, par des tests d'invariant sur de nombreuses graines, et par
  des tests statistiques sur des expéditions complètes.
- Un nouveau niveau de difficulté ne demande qu'une nouvelle stratégie : la vérification
  des types signale tout niveau dépourvu de stratégie.
- Les décisions enregistrées sont vérifiables a posteriori, et une modification ultérieure
  des stratégies ne change pas le résultat des manches passées.
- La simulation, qui joue des milliers d'expéditions en quelques secondes, permet de
  mesurer l'effet d'une règle avant de la publier.

### Négatives

- Un personnage piloté par l'ordinateur ne peut pas agir entre deux échéances, ni de sa
  propre initiative : il ne réagit qu'au moment de la résolution d'une manche.
- La qualité de l'équilibre mesuré dépend de la règle suivie par les joueurs simulés, qui
  ne représente qu'imparfaitement le comportement des joueurs réels.
- Une expédition dont les joueurs sont tous absents ne progresse que par les échéances :
  un compagnon ne peut pas mener seul une expédition.
- L'intelligence artificielle doit rester assez peu coûteuse pour être calculée lors d'une
  lecture : un algorithme de recherche élaboré n'y a pas sa place.
- Les événements `RoundResolved` contiennent davantage de données, puisque les actions des
  compagnons y sont enregistrées.

## Alternatives écartées

- **Boucle de jeu exécutée par un processus permanent** : l'hébergement ne permet aucun
  processus permanent, et une telle boucle exigerait une infrastructure supplémentaire,
  sans gain pour un jeu dont les manches durent trente secondes.
- **Décisions prises par le navigateur d'un joueur** : elles dépendraient de la présence
  d'un navigateur connecté, et un joueur pourrait les modifier à son avantage ; la stratégie
  des monstres, qui connaît les actions choisies, révélerait ces actions au navigateur.
- **Recalcul des décisions lors de la relecture plutôt que leur enregistrement** : toute
  modification d'une stratégie changerait le résultat des manches déjà jouées, et l'état
  reconstruit ne correspondrait plus à ce que les joueurs ont vu.

## Réexamen

Cette décision devra être réexaminée si le jeu a besoin d'un personnage qui agit en temps
réel ou de sa propre initiative, si l'intelligence artificielle devient trop coûteuse en
calcul pour être exécutée lors d'une lecture, ou si l'hébergeur propose un service de
tâches de fond compatible avec l'offre retenue.

## Usage de l'IA générative

Aucun.
