# Fiche de cadrage : La Flotte

- Auteur : Swixos
- Date : 23 octobre 2026
- Nom technique du module : `fleet`
- Validée par l'enseignant le :

## L'idée

Inspirée des raids navals de Grepolis, la Flotte permet à un joueur d'armer des trirèmes en
payant leur équipement avec les ressources de son village, puis de les lancer contre le
village d'un autre joueur ou contre une île tenue par des pirates. La flotte met plusieurs
minutes à traverser la mer : pendant ce temps, le défenseur voit l'alerte « Flotte ennemie en
approche » en temps réel, et peut changer de posture défensive. À l'arrivée, la bataille se
résout par un affrontement de tactiques (éperonnage, abordage, blocus) qui se battent en
triangle, pondéré par le nombre de navires et par la défense du village. Une flotte victorieuse
pille ce que le village peut donner, dans la limite de ce que ses cales emportent. Une flotte
rappelée avant l'arrivée rend son équipement à son village.

L'intérêt dans le jeu est double : les villages, jusqu'ici isolés, entrent en interaction
directe, et le choix d'une tactique contre la posture de l'adversaire crée un jeu de lecture
de l'autre joueur, absent des modules existants. Les îles pirates, pilotées par l'ordinateur,
offrent une cible au joueur seul, et récompensent celui qui varie ses tactiques.

## Les règles métier

1. Un raid engage de 1 à 10 trirèmes.
2. Un joueur ne peut pas lancer un raid contre son propre village, ni contre un joueur qui n'a
   pas fondé de village.
3. Un joueur a au plus deux raids en mer à la fois.
4. L'équipement d'un raid coûte 15 bois et 5 pierre par trirème. Il est prélevé sur le village
   de l'attaquant avant le départ : si le village ne peut pas le payer, le raid est annulé, et
   aucune flotte ne part.
5. La durée de la traversée dépend de la distance entre les deux villages : elle est comprise
   entre 2 et 6 minutes, et toujours la même pour deux villages donnés. Elle est fixe pour
   chaque île pirate.
6. Seul l'attaquant peut rappeler sa flotte, et seulement avant son arrivée : l'équipement lui
   est alors rendu en totalité.
7. Les tactiques se battent en triangle : l'abordage bat l'éperonnage, l'éperonnage bat le
   blocus, le blocus bat l'abordage. La force d'attaque vaut 10 par trirème, multipliée par 1,5
   si la tactique de l'attaquant bat la posture du défenseur, et par 0,5 si elle est battue.
8. La défense d'un village vaut 20, plus 5 par amélioration de bâtiment qu'il a réalisée.
   L'attaquant l'emporte si sa force est strictement supérieure à la défense ; sinon, sa
   flotte est perdue.
9. Une flotte victorieuse pille au plus 10 bois, 5 pierre et 2 or par trirème. Si le village
   ne possède pas tout ce butin, le pillage est réduit à ce qui manque une seule fois ; un
   second refus laisse la flotte rentrer sans butin.
10. Un joueur ne choisit sa posture défensive que pour son propre village ; un village sans
    posture choisie défend en blocus.
11. Le capitaine pirate d'une île choisit sa posture sans hasard : celle qui bat la tactique
    que l'attaquant a le plus employée contre les pirates, l'abordage à égalité ou en
    l'absence d'historique.
12. Un joueur n'attaque chaque île pirate qu'une fois par jour : un raid annulé faute
    d'équipement, ou rappelé avant l'arrivée, ne compte pas.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Voir les cibles possibles : villages les plus proches des autres joueurs, ou ceux dont le nom contient une recherche, et îles pirates | Lecture | `GET /api/fleet/targets?search=` |
| Voir ses raids, envoyés et subis | Lecture | `GET /api/fleet/raids` |
| Voir le détail et le rapport de bataille d'un raid | Lecture | `GET /api/fleet/raids/:id` |
| Lancer un raid | Commande `LaunchRaid` | `POST /api/fleet/raids` |
| Rappeler sa flotte | Commande `RecallFleet` | `POST /api/fleet/raids/:id/recall` |
| Voir sa posture défensive | Lecture | `GET /api/fleet/harbor` |
| Choisir sa posture défensive | Commande `ChoosePosture` | `PUT /api/fleet/harbor/posture` |

## Le stockage envisagé

Le journal d'événements, selon le modèle decider : un flux `raid-<id>` par raid, et un flux
`harbor-<joueur>` pour la posture défensive de chaque village. L'historique a ici une valeur de
jeu : un rapport de bataille est l'enchaînement des événements du raid (départ, arrivée,
bataille, pillage), et l'IA des pirates s'appuie sur l'historique des tactiques d'un joueur. Le
raid est aussi une saga, dont l'état doit survivre aux redémarrages et aux réessais, comme les
offres du Marché.

Les lectures de liste (cibles, raids d'un joueur) sont servies par un modèle de lecture tenu
par une projection, rangé dans le schéma `fleet`, et créé par une migration.

## La communication avec les modules existants

- **Village (`realm`), dans les deux sens, par messages de la boîte d'envoi.** La Flotte
  demande au Village le prélèvement de l'équipement (étape compensable), le prélèvement du
  butin chez le défenseur, puis les dépôts du butin chez l'attaquant ou de l'équipement rendu
  lors d'un rappel (compensation). Le Village répond sur un sujet de la Flotte. Les
  identifiants de transfert sont construits à partir de l'identifiant du raid, ce qui rend les
  gestionnaires idempotents.
- **Village (`realm`), par la lecture de son langage publié.** La projection de la Flotte lit
  les événements de fondation et d'amélioration des villages, pour connaître les cibles et
  calculer leur défense.
- **Classement (`ranking`), par la lecture du langage publié de la Flotte.** La projection du
  Classement compte l'or pillé par une flotte victorieuse dans l'or rapporté par le joueur. Sa
  version est augmentée afin qu'elle soit reconstruite.

## Les données personnelles

- Les identifiants de l'attaquant et du défenseur de chaque raid, ainsi que leurs noms, copiés
  dans les événements du raid pour les rapports de bataille.
- Le nom du village de chaque joueur, copié dans le modèle de lecture des cibles.
- La posture défensive choisie par le joueur.

À l'effacement d'un compte, les noms sont remplacés dans les événements et dans le modèle de
lecture, et le village effacé disparaît des cibles. L'export comprend les raids envoyés et
subis, et la posture.

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
