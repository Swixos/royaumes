# ADR-0021 - Historique du joueur, projection du langage publié de quatre modules

- Statut : accepté
- Date : 2026-10-25

## Contexte

Ce qui arrive à un joueur est dispersé : les chantiers dans la fiche du Sénat, les raids et
les batailles dans le journal de bord de la Flotte, les expéditions dans le Donjon, les
échanges dans le Marché. Aucun écran ne raconte l'ensemble, et les faits passés disparaissent
des écrans une fois terminés.

## Décision

Un module `chronicle` tient l'historique de chaque joueur. Il n'a aucune commande et aucun
événement propre : une projection lit le langage publié de quatre modules, et écrit pour
chaque joueur une entrée par événement qui le concerne :

- **Village** : la fondation et chaque chantier commandé, avec son heure de fin ;
- **Flotte** : les raids lancés, annulés, rappelés ou abandonnés, pour l'attaquant ; les
  flottes repérées ou qui font demi-tour, pour le défenseur ; le rapport de bataille, pour les
  deux camps ; les changements de posture ;
- **Donjon** : l'ouverture d'une expédition, l'arrivée d'un joueur, et l'issue pour chaque
  joueur, compagnons exclus ;
- **Marché** : la publication et le retrait d'une offre pour le vendeur, et l'échange conclu
  pour le vendeur comme pour l'acheteur.

Les événements suivants d'un raid, d'une expédition ou d'une offre ne nomment que leur
identifiant : la projection garde donc à part l'attaquant et la cible de chaque raid, les
joueurs de chaque expédition, le vendeur et l'acheteur de chaque offre. Une entrée garde les
données du fait ; l'interface les raconte en français (`tell`), ce qui permet de dire
« en construction » ou « construit » selon l'heure de lecture.

Chaque bataille garde aussi son rapport détaillé, comme dans Grepolis : les trirèmes et la
tactique de la flotte, la posture du défenseur, l'avantage du triangle des tactiques, le
calcul de la force d'attaque et de la défense (rempart compris), l'issue, les pertes, le
butin et la cale, et, pour le perdant, ce qui aurait changé l'issue. La projection garde la
flotte de chaque raid et son événement `BattleFought` ; les règles publiées par la Flotte
(force d'une trirème, défense d'un rempart, triangle des tactiques) donnent le détail du
calcul. Le rapport s'ouvre depuis l'entrée de la bataille (version 2 de la projection).

L'API `GET /api/chronicle/entries` renvoie les entrées du joueur connecté, de la plus récente
à la plus ancienne, par pages de trente, filtrées au besoin par partie du jeu. La lecture
rattrape la projection, comme pour le Classement. L'écran est une fenêtre du jeu, ouverte par
le menu « Historique ».

Les entrées copient les noms des autres joueurs. Après un effacement ou une rectification, le
journal est réécrit, puis la projection est reconstruite à partir de lui : tous les noms
copiés suivent le journal.

## Conséquences

### Positives

- Un seul écran raconte toute la partie d'un joueur, y compris les faits terminés.
- Aucun module existant n'est modifié : l'historique ne dépend que de leurs contrats.
- L'historique peut être reconstruit à tout moment depuis le journal.

### Négatives

- Un changement du langage publié d'un module doit être répercuté dans la projection, sous
  peine d'entrées manquantes.
- Un effacement ou une rectification reconstruit tout l'historique, de tous les joueurs.
- L'historique n'a pas de canal temps réel : il est lu à l'ouverture de sa fenêtre.

## Alternatives écartées

- **Lire le journal à chaque consultation** : chaque lecture parcourrait les flux de tous les
  modules, et devrait retrouver les raids, expéditions et offres d'un joueur.
- **Un historique tenu par chaque module** : quatre tables et quatre routes à rassembler dans
  l'interface, pour un même besoin de lecture.

## Usage de l'IA générative

