# Fiche de cadrage : La Flotte

- Auteur : Swixos
- Date : 23 octobre 2026
- Nom technique du module : `fleet`
- Validée par l'enseignant le : sans objet, validation non demandée pour cette évaluation

## L'idée

Inspirée des raids de Grepolis, la Flotte permet à un joueur d'embarquer une armée formée dans
son village (troupes de la caserne, navires du chantier naval) et de la lancer contre le
village d'un autre joueur ou contre une île tenue par des pirates. La flotte met plusieurs
minutes à traverser la mer, selon la distance sur la carte : pendant ce temps, le défenseur
voit l'alerte « Flotte ennemie en approche » en temps réel. À l'arrivée, les navires se
battent d'abord en mer, puis les troupes débarquées affrontent la garnison, renforcée par le
rempart. Chaque camp perd des unités ; les survivants victorieux pillent ce qu'ils peuvent
porter. Une armée rappelée avant l'arrivée rentre au village.

L'intérêt dans le jeu est double : les villages, jusqu'ici isolés, entrent en interaction
directe, et la composition d'une armée (types de dégâts, navires d'escorte, transports) face à
une garnison crée un vrai choix stratégique. Les îles pirates, pilotées par l'ordinateur,
offrent une cible au joueur seul, et récompensent celui qui varie ses armes.

## Les règles métier

Les règles 1, 4 et 6 à 11 ont été revues quand les raids sont passés des trirèmes armées au
départ aux armées formées au village (ADR 0023) ; l'écart est expliqué dans le document de
rendu.

1. Une armée compte au moins un navire, et ses troupes tiennent dans les cales de ses
   bateaux de transport.
2. Un joueur ne peut pas lancer un raid contre son propre village, ni contre un joueur qui n'a
   pas fondé de village.
3. Un joueur a au plus deux raids en mer à la fois, plus un tous les 4 niveaux du chantier
   naval (ADR 0018).
4. L'armée est retirée de la garnison du village de l'attaquant avant le départ : si les
   unités demandées n'y sont pas, le raid est annulé, et aucune flotte ne part.
5. La durée de la traversée dépend de la distance sur la carte entre le village de
   l'attaquant et sa cible, village ou île pirate : elle est comprise entre 1 et 7 minutes, et
   toujours la même pour deux places données. Le navire le plus lent de l'armée fixe son pas,
   et le chantier naval de l'attaquant la raccourcit de 4 % par niveau (ADR 0018, ADR 0023).
6. Seul l'attaquant peut rappeler son armée, et seulement avant son arrivée : elle rentre au
   village après le temps déjà passé en mer.
7. La bataille commence en mer, si la cible a des navires : la flotte la plus forte l'emporte,
   la flotte vaincue est perdue avec les troupes qu'elle porte, et le vainqueur perd une part
   de ses navires de combat qui croît avec la force du vaincu.
8. Sur terre, l'attaque de chaque type de dégâts (contondant, tranchant, à distance) affronte
   la défense des unités contre ce type, plus la défense des habitants, renforcée de 8 % par
   niveau du rempart. L'égalité revient au défenseur ; le vaincu perd toutes ses troupes, le
   vainqueur une part qui croît avec la force du vaincu.
9. Une armée victorieuse pille ce que ses survivants peuvent porter, réparti entre le bois, la
   pierre et l'or. Si le village ne possède pas tout ce butin, le pillage est réduit une seule
   fois à ce qu'il possède ; les survivants rentrent avec le butin à l'heure de retour.
10. Un village est défendu par les unités présentes dans sa garnison à l'arrivée de la flotte,
    et le défenseur perd ses morts.
11. Le capitaine pirate d'une île appelle sans hasard un renfort : l'unité qui défend le mieux
    contre le type de dégâts que l'attaquant lui a le plus infligé, aucun renfort à égalité ou
    sans historique.
12. Un joueur n'attaque chaque île pirate qu'une fois par jour : un raid annulé, ou rappelé
    avant l'arrivée, ne compte pas.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Voir les cibles possibles, et les troupes prêtes à partir | Lecture | `GET /api/fleet/targets?search=` |
| Voir ses raids, envoyés et subis | Lecture | `GET /api/fleet/raids` |
| Voir le détail et le rapport de bataille d'un raid | Lecture | `GET /api/fleet/raids/:id` |
| Lancer un raid avec une armée | Commande `LaunchRaid` | `POST /api/fleet/raids` |
| Rappeler son armée | Commande `RecallFleet` | `POST /api/fleet/raids/:id/recall` |
| Voir la garnison, le rempart et les avis de son port | Lecture | `GET /api/fleet/harbor` |

## Le stockage envisagé

Le journal d'événements, selon le modèle decider : un flux `raid-<id>` par raid, et un flux
`harbor-<joueur>` pour les avis du port de chaque village. L'historique a ici une valeur de
jeu : un rapport de bataille est l'enchaînement des événements du raid (départ, arrivée,
bataille, pillage), et l'IA des pirates s'appuie sur l'historique des armes d'un joueur. Le
raid est aussi une saga, dont l'état doit survivre aux redémarrages et aux réessais, comme les
offres du Marché.

Les lectures de liste (cibles, raids d'un joueur) sont servies par un modèle de lecture tenu
par une projection, rangé dans le schéma `fleet`, et créé par une migration.

## La communication avec les modules existants

- **Village (`realm`), dans les deux sens, par messages de la boîte d'envoi.** La Flotte
  demande au Village le retrait de l'armée de sa garnison (étape compensable), le retrait des
  morts et du butin chez le défenseur, puis le retour des survivants et le dépôt du butin chez
  l'attaquant, ou le retour de toute l'armée lors d'un rappel (compensation). Le Village répond sur un sujet de la Flotte. Les
  identifiants de transfert sont construits à partir de l'identifiant du raid, ce qui rend les
  gestionnaires idempotents.
- **Village (`realm`), par la lecture de son langage publié.** La projection de la Flotte lit
  les événements de fondation et d'amélioration des villages, et les mouvements de leurs
  unités, pour connaître les cibles, leur rempart et leur garnison.
- **Classement (`ranking`), par la lecture du langage publié de la Flotte.** La projection du
  Classement compte l'or pillé par une flotte victorieuse dans l'or rapporté par le joueur. Sa
  version est augmentée afin qu'elle soit reconstruite.

## Les données personnelles

- Les identifiants de l'attaquant et du défenseur de chaque raid, ainsi que leurs noms, copiés
  dans les événements du raid pour les rapports de bataille.
- Le nom du village de chaque joueur, copié dans le modèle de lecture des cibles.
- Les armées envoyées et les rapports de bataille, qui disent ce que chaque joueur a perdu.

À l'effacement d'un compte, les noms sont remplacés dans les événements et dans le modèle de
lecture, et le village effacé disparaît des cibles. L'export comprend les raids envoyés et
subis, et les avis du port.

## Les bonus visés

1. B5 : saga avec étape compensable entre la Flotte et le Village (équipement prélevé, rendu
   si la flotte est rappelée).
2. B1 : canal temps réel `harbor-<joueur>`, réservé au joueur, qui annonce les flottes en
   approche et les rapports de bataille.
3. B3 : capitaines pirates pilotés par une IA déterministe et testée.
4. B2 : arrivée des flottes gérée comme une échéance, sans tâche de fond.
5. B4 : modèle de lecture des cibles et des raids tenu par une projection, avec son point de
   reprise et sa version.
6. B6 : communication avec le Village et avec le Classement.
7. B8 : fonction d'aptitude qui vérifie que le domaine de la Flotte n'emploie ni hasard ni
   horloge, condition du déterminisme des batailles.
8. B7 : test de charge des trois lectures de la Flotte, dans le budget de performance.
9. B10 : tests de bout en bout Playwright d'un raid entre deux joueurs, avec l'alerte en temps
   réel et le rappel de la flotte.
10. B11 : droit de rectification du nom d'un joueur, partout où il est recopié, y compris dans
    les raids.
11. B12 : jeton signé, à durée de vie courte, à la place du secret partagé entre l'application
    et le service Village extrait.
12. B13 : piste « Généraliser le contrôle d'accès » du TD4, un test qui vérifie que toute route
    non publique refuse une requête anonyme.

L'extraction de la Flotte en service (B9) n'est pas visée : le plafond des bonus est atteint
sans elle, et le Village extrait au TD11 démontre déjà ce mécanisme.
