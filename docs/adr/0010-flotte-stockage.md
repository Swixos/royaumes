# ADR-0010 - Module Flotte : journal d'événements pour les raids et les ports, projection pour les listes

- Statut : accepté
- Date : 2026-10-23

## Contexte

La Flotte, module de l'évaluation finale (fiche de cadrage `docs/evaluation/fiche-cadrage.md`),
permet à un joueur de lancer un raid naval contre le village d'un autre joueur ou contre une île
pirate. Un raid vit plusieurs minutes : il est équipé avec les ressources de l'attaquant, traverse
la mer, livre bataille à son arrivée, puis pille ou sombre. Il concerne deux joueurs, et parfois
un adversaire piloté par l'ordinateur.

Trois besoins portent sur les données :

- l'état d'un raid doit survivre à une panne et aux réessais d'une saga, comme celui d'une offre
  du Marché (ADR 0007) ;
- le rapport de bataille et la mémoire des capitaines pirates, qui jouent contre la tactique
  favorite de l'attaquant (règle 11), reposent sur l'historique des raids : cet historique a une
  valeur de jeu ;
- les écrans lisent des listes transverses : les cibles d'un joueur, ses raids envoyés et subis,
  le nombre de ses flottes en mer, les îles qu'il a déjà attaquées dans la journée.

Le défenseur doit en outre conserver sa posture défensive et voir, en temps réel, les flottes
qui le menacent et les rapports qui le concernent (ADR 0003).

## Décision

La Flotte conserve ses faits dans le journal d'événements de la plateforme, selon le modèle
decider, avec la concurrence optimiste du TD3 :

- un flux `raid-<id>` par raid, dont l'état est l'état de la saga (`RaidLaunched`, `FleetSailed`,
  `BattleFought`, `RaidPlundered`, et les issues `RaidCancelled`, `FleetRecalled`, `RaidAborted`) ;
- un flux `harbor-<joueur>` par port, qui porte la posture choisie (`PostureChosen`) et les avis
  reçus (`FleetSighted`, `FleetTurnedBack`, `BattleReported`). Ce flux est aussi le canal temps
  réel du port, réservé à son propriétaire.

Les lectures de liste sont servies par une projection, `fleet` (version 1), rattrapée avant
chaque lecture (ADR 0006). Elle tient deux tables du schéma `fleet`, créées par la migration
`0013_flotte` : `fleet.harbors`, les villages qui peuvent être attaqués et leur nombre
d'améliorations, et `fleet.raids`, le résumé de chaque raid. La projection lit à la fois les
événements de la Flotte et ceux du Village (`VillageFounded`, `BuildingUpgraded`), langage
publié du module Village (ADR 0011).

Le domaine (`src/modules/fleet/domain/`) ne lit ni l'horloge ni le hasard : le service lui passe
l'heure, et le contexte d'une décision (flottes en mer, existence de la cible, défense à
l'arrivée) lu dans le modèle de lecture.

## Conséquences

### Positives

- Un rapport de bataille est l'enchaînement des événements du raid : il se relit, s'exporte et se
  réécrit comme n'importe quel flux, sans table supplémentaire.
- La mémoire des pirates est un simple filtre de la table `fleet.raids`, reconstructible depuis le
  journal ; une règle d'IA corrigée s'applique à tout l'historique.
- Le canal du port réutilise le mécanisme des canaux du Village (ADR 0003) : un flux, une règle
  d'accès, aucune table de notifications à purger.
- Le modèle de lecture se reconstruit entièrement depuis le journal, y compris après un
  effacement, puisque les événements réécrits portent les noms neutres.

### Négatives

- Les règles qui portent sur plusieurs raids (au plus deux flottes en mer, une attaque par île et
  par jour) sont vérifiées sur le modèle de lecture, et non dans une transaction : deux lancements
  simultanés peuvent tous deux voir une seule flotte en mer (dette DT-014).
- La liste des cibles lit tous les villages pour garder les plus proches, la durée de traversée
  étant calculée et non stockée (dette DT-015).
- Les avis d'un port s'accumulent dans son flux sans limite de durée (dette DT-016).
- Un port est un flux de plus par joueur, créé au premier avis ou au premier choix de posture.

## Alternatives écartées

- **Tables classiques, comme la Taverne (ADR 0008)** : l'historique des raids a ici une valeur de
  jeu (rapports, mémoire des pirates), et la saga demande un état rejouable après une panne ; des
  tables mises à jour en place perdraient l'enchaînement des faits, et la saga devrait tenir son
  propre journal d'étapes.
- **Un seul flux par joueur, portant ses raids et son port** : deux raids d'un même joueur
  entreraient en conflit de version à chaque étape de saga, et un raid concerne deux joueurs, ce
  qui l'aurait obligé à vivre dans deux flux à la fois.
- **Ranger les raids dans le flux du village de l'attaquant** : la Flotte écrirait dans les
  données du Village, en violation de la règle d'encapsulation (TD2) et de l'ADR 0007.
- **Lire les listes en rejouant tous les flux de raids** : chaque lecture coûterait le journal
  entier de la Flotte ; la projection, rattrapée à la lecture, ne lit que les nouveaux événements.

## Réexamen

À réexaminer si les règles transverses (flottes en mer, attaque quotidienne) doivent devenir
strictes, ce qui demanderait un flux par attaquant pour les sérialiser, ou si le nombre de joueurs
rend la lecture de tous les villages trop coûteuse, ce qui demanderait une carte découpée en
zones.

## Usage de l'IA générative

