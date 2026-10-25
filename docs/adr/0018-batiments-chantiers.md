# ADR-0018 - Bâtiments à effets et chantiers à durée, en fin de file plutôt qu'à la commande

- Statut : accepté
- Date : 2026-10-25

## Contexte

Le village ne comptait que trois bâtiments de production, et une amélioration prenait effet à
l'instant de sa commande. Leur seul autre usage était la défense du port, qui comptait 5 par
amélioration de n'importe quel bâtiment (règle 8 de la fiche de cadrage). Rien ne donnait de
raison de choisir un bâtiment plutôt qu'un autre, ni de planifier. Dans Grepolis, chaque
bâtiment a un rôle propre, et chaque construction prend du temps.

Le Village est tenu en Event Sourcing (ADR 0002) : ses événements déjà enregistrés doivent
rester lisibles. La Flotte lit les événements du Village par son langage publié (ADR 0011),
et décide des batailles sans horloge ni hasard (ADR 0013).

## Décision

Le catalogue du Village compte sept bâtiments : le sénat, les trois bâtiments de production,
l'entrepôt, le rempart et le chantier naval. Chacun a un coût, une durée de construction et des
prérequis (`catalog.ts`).

- **Chantiers à durée.** `BuildingUpgraded` garde son nom et reçoit un champ facultatif
  `completesAt`. L'amélioration est payée à `at` et le bâtiment monte de niveau à `completesAt`.
  Un événement plus ancien, sans ce champ, prend effet à `at`, comme avant : aucun événement
  n'est réécrit, et aucune version de l'événement n'est ajoutée. La fin d'un chantier n'est
  pas un événement : elle est calculée à la lecture, comme la production (`accrue`), qui
  change de taux à l'instant exact où le chantier se termine. La file compte deux places, et
  un chantier commence à la fin du précédent. Le sénat raccourcit les durées de 5 % par niveau.
- **Entrepôt.** La production s'arrête quand le stock d'une ressource atteint la capacité de
  l'entrepôt. Une livraison (butin, marché) peut la dépasser, mais le stock ne grandit plus
  au-delà. Un pillage, signalé par le champ `plunder` du message `realm.withdraw`, ne peut pas
  prendre la part que l'entrepôt cache.
- **Rempart.** La défense d'un village vaut 20, plus 12 par niveau de rempart. Ce calcul
  remplace la règle 8 de la fiche de cadrage, qui comptait toute amélioration.
- **Chantier naval.** Chaque niveau ajoute 2 trirèmes au plus grand raid, une flotte en mer
  tous les 4 niveaux, et raccourcit les traversées de 4 %.
- **Lecture par la Flotte.** La projection `fleet` (version 2) garde, pour le rempart et le
  chantier naval de chaque village, la liste des niveaux atteints avec leur heure de fin de
  chantier (migrations `0014` et `0015`). La bataille lit le niveau du rempart à l'heure
  d'arrivée de la flotte, et le lancement lit le niveau du chantier naval à l'heure du
  lancement. Le résultat d'un raid reste donc le même, quel que soit le moment où son arrivée
  est résolue.

## Conséquences

### Positives

- Chaque bâtiment a un rôle visible, dans la fiche du bâtiment comme sur la scène du village.
- Les événements déjà enregistrés restent valides sans migration du journal.
- La règle de défense reste déterministe : elle ne dépend que des événements et de l'heure
  d'arrivée de la flotte.

### Négatives

- La fin d'un chantier n'est pas un fait du journal : une projection qui en a besoin doit
  recalculer l'heure de fin, comme le fait la projection `fleet`.
- La règle 8 de la fiche de cadrage ne décrit plus le jeu. Ce document la remplace.
- La colonne `upgrades` des ports disparaît : la projection `fleet` est reconstruite depuis
  le journal au premier accès.

## Alternatives écartées

- **Un événement `BuildingCompleted` à la fin de chaque chantier** : il faudrait une tâche de
  fond ou une échéance pour l'enregistrer à l'heure dite, alors que la fin se calcule à la
  lecture sans rien enregistrer.
- **Un nouvel événement `BuildingOrdered` à la place de `BuildingUpgraded`** : les projections
  du Classement et de la Flotte, qui lisent déjà `BuildingUpgraded`, devraient lire les deux.
- **Garder la défense par amélioration** : le rempart n'aurait servi à rien de plus qu'un autre
  bâtiment.

## Usage de l'IA générative

