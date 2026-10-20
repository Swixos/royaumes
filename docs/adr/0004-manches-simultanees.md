# ADR-0004 - Manches simultanées et échéances paresseuses pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les combats du Donjon réunissent jusqu'à quatre joueurs humains. Aucun d'eux ne doit
attendre indéfiniment un joueur absent, et l'ordre de jeu ne doit avantager personne.

L'hébergement sur l'offre gratuite de Vercel ne permet ni minuteur en mémoire, puisque
aucune instance ne survit d'une requête à l'autre, ni tâche de fond. Les tâches
planifiées de cette offre ne s'exécutent qu'une fois par jour, ce qui est sans commune
mesure avec une manche de quelques secondes.

L'état d'une expédition est reconstruit à partir de ses événements (ADR 0002) : tout
calcul, y compris le hasard, doit produire le même résultat à chaque relecture.

Les choix des joueurs doivent rester secrets jusqu'à la résolution de la manche, sans
quoi le dernier à choisir connaîtrait les choix des autres.

## Décision

Les héros choisissent leur action simultanément. La manche est résolue lorsque tous les
héros debout ont choisi, ou lorsque son échéance de trente secondes est atteinte ; un
héros qui n'a rien choisi se défend.

L'échéance de chaque manche est enregistrée dans les événements (`RoomEntered`,
`RoundResolved`). Une manche échue est résolue à l'instant de son échéance, et non à
l'instant où la résolution est calculée (`settle`, dans `src/modules/dungeon/domain/rules.ts`).

Une lecture calcule la résolution des manches échues pour l'afficher, sans rien enregistrer
(`toView`). Toute commande commence par enregistrer ces résolutions. Le navigateur envoie
une commande d'échéance lorsque son compte à rebours atteint zéro ; le serveur, avec sa
propre horloge, décide si l'échéance est atteinte.

Le hasard est tiré dans `decide`, avec un générateur dont la graine est dérivée de la
graine de l'expédition et du numéro de manche (`mix(seed, 1, round)`). Ses résultats,
dégâts compris, sont enregistrés dans les événements, que `evolve` applique tels quels.

Une action porte le numéro de la manche visée, et est refusée (`ROUND_OVER`) si cette
manche est déjà résolue.

## Conséquences

### Positives

- Aucun joueur n'attend plus de trente secondes, et aucun n'est avantagé par l'ordre de
  jeu : tous choisissent sans connaître le choix des autres.
- Aucune infrastructure n'est nécessaire : ni minuteur, ni tâche de fond, ni service de
  planification. N'importe quelle instance peut traiter n'importe quelle requête.
- Le résultat d'une manche ne dépend pas du moment où il est calculé : une lecture, une
  commande ou une commande d'échéance tardive produisent le même résultat.
- La commande d'échéance est idempotente, et les commandes simultanées sont départagées
  par la concurrence optimiste : chaque navigateur peut l'envoyer sans coordination, et
  une seule résolution est enregistrée.
- Le hasard est reproductible et vérifiable : rejouer les événements redonne exactement le
  même état, et la graine n'est jamais transmise aux joueurs.

### Négatives

- Lorsque plus aucun joueur ne se manifeste, le journal peut rester en retard sur ce
  qu'affichent les lectures : une manche échue n'est enregistrée qu'à la commande suivante.
  Une expédition abandonnée n'enregistre jamais sa fin, ce qui la privera d'événement
  `GameEnded` pour le classement (TD8).
- Les notifications temps réel dépendent des navigateurs : sans membre connecté pour
  envoyer la commande d'échéance, aucun événement n'est enregistré, donc aucun n'est diffusé.
- Le code est moins intuitif : une lecture peut afficher une manche que le journal ne
  contient pas encore, et le navigateur envoie des commandes qui peuvent ne rien enregistrer.
- Une modification de l'algorithme du générateur ou de la dérivation des graines changerait
  le résultat des manches futures ; les manches passées, enregistrées, ne sont pas affectées.
- L'exploration n'a pas d'échéance : un joueur absent dont c'est le tour bloque l'expédition.

## Alternatives écartées

- **Tour par tour strict** : chaque joueur agit à son tour, en connaissant les actions des
  précédents. Les joueurs s'attendent mutuellement, et le dernier à jouer est avantagé.
- **Minuteur en mémoire ou tâche planifiée** : un minuteur ne survit pas à la fin d'une
  fonction sans serveur, et les tâches planifiées de l'offre gratuite sont quotidiennes.
- **Lecture qui enregistre elle-même la résolution** : une lecture deviendrait une écriture,
  exposée aux conflits et aux erreurs d'écriture, et un simple affichage modifierait le
  journal ; une requête de lecture répétée par un navigateur provoquerait des écritures.
- **Tirage par `Math.random`, dont seul le résultat serait enregistré** : le résultat
  dépendrait du moment et de l'instance qui calcule la résolution, une lecture et une
  commande pourraient afficher des résultats différents pour la même manche, et le tirage
  ne pourrait pas être vérifié.

## Réexamen

Cette décision devra être réexaminée si la fin d'une expédition abandonnée doit être
enregistrée, par exemple pour le classement, si l'hébergeur propose un service de
planification de tâches à courte échéance compatible avec l'offre retenue, ou si des héros
pilotés par l'ordinateur doivent agir sans qu'aucun navigateur ne soit connecté (TD7).

## Usage de l'IA générative

Aucun.
