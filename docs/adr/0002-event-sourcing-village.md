# ADR-0002 - Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le Village est un état qui évolue par une suite d'actions du joueur : fondation, puis
améliorations successives des bâtiments. La production de ressources n'est pas une action :
elle est calculée à partir du temps écoulé depuis le dernier changement.

Le projet annonce deux besoins qui reposent sur l'historique de ces actions : la diffusion
en temps réel des changements d'un village (TD5), et la construction de vues de lecture à
partir de l'activité des joueurs, comme le classement (TD8).

L'application est hébergée sans serveur sur Vercel : plusieurs instances peuvent traiter en
même temps des requêtes portant sur un même village, par exemple lors d'un double clic ou
depuis deux onglets. Aucune instance ne conserve d'état en mémoire d'une requête à l'autre.

## Décision

L'état d'un village n'est pas stocké. Il est reconstruit à chaque lecture en rejouant ses
événements avec la fonction `replay` du domaine (`src/modules/realm/domain/village.ts`).

Les événements sont enregistrés dans le journal générique de la plateforme, la table
`platform.events` (`src/platform/event-store/`), en ajout seul. Chaque village correspond à
un flux nommé `village-<joueur>`, dans lequel chaque événement porte une version croissante
à partir de 1.

Les écritures concurrentes sont détectées par la contrainte d'unicité sur le couple
`(stream, version)`. Une écriture refusée lève une `ConcurrencyError`, et le service du
Village rejoue l'ensemble de la commande (chargement, décision, enregistrement) au plus
trois fois, par `withOptimisticRetry`.

Un événement porte toutes les informations nécessaires à son application, sans dépendre
de règles susceptibles d'évoluer : l'événement `BuildingUpgraded` contient le coût
effectivement payé, et non seulement le bâtiment amélioré.

## Conséquences

### Positives

- L'historique complet de chaque village est conservé : il est possible de savoir quand et
  comment un état a été atteint, ce qui facilite le diagnostic d'une anomalie.
- Les événements alimenteront directement le temps réel (TD5) et les projections (TD8),
  sans mécanisme de capture supplémentaire.
- Le domaine reste pur : `decide` et `evolve` ne connaissent ni la base ni le journal, et
  se testent sans infrastructure.
- La concurrence est traitée sans verrou : la base garantit qu'une seule écriture réussit
  sur une version donnée, et la commande perdante est rejouée sur l'état à jour.
- Le journal est générique : il servira aux autres modules qui en auront besoin, comme le
  Donjon, sans nouvelle table.

### Négatives

- Un événement enregistré ne peut plus être modifié. Toute évolution de la structure d'un
  événement doit rester compatible avec les événements déjà enregistrés, ou s'accompagner
  d'une conversion à la lecture.
- Chaque lecture rejoue tous les événements du village : son coût croît avec la longueur
  du flux.
- L'adaptateur convertit les événements génériques du journal en événements typés du
  domaine par une assertion de type, sans validation : une erreur de structure ne serait
  pas détectée à la lecture.
- Le modèle est plus difficile à appréhender qu'une table contenant l'état courant, et
  l'état d'un village ne peut pas être consulté directement dans la base.
- L'effacement des données d'un joueur, exigé par le RGPD, devra être traité malgré un
  journal en ajout seul (TD10).

## Alternatives écartées

- **Stockage de l'état dans une table propre au module** (une ligne par village, mise à
  jour à chaque commande) : plus simple à lire, mais l'historique des actions serait perdu,
  et le temps réel comme les projections exigeraient un mécanisme supplémentaire pour
  capter les changements. La concurrence exigerait en outre une colonne de version gérée
  à la main.
- **Verrouillage pessimiste** (`SELECT ... FOR UPDATE` sur le village pendant le traitement
  d'une commande) : les conflits étant rares, verrouiller chaque commande ralentirait toutes
  les requêtes pour un cas exceptionnel. Un verrou maintenu pendant une requête est en outre
  mal adapté à l'exécution sans serveur, où les connexions sont partagées et de courte durée.
- **Journal propre au module Village** : une table d'événements dans un schéma `realm`
  dupliquerait le mécanisme pour chaque module qui en aurait besoin, alors que le journal
  ne dépend d'aucune règle métier.

## Réexamen

Cette décision devra être réexaminée si le nombre d'événements par village rend la
reconstruction de l'état perceptible dans le temps de réponse. Un instantané de l'état,
enregistré périodiquement dans le flux, serait alors la première piste à étudier, avant
toute remise en cause du modèle.

Elle devra l'être également si l'évolution des règles du jeu impose des changements de
structure des événements trop fréquents pour être absorbés à la lecture.

## Usage de l'IA générative

Aucun.
