# ADR-0023 - Troupes formées au village, et raids menés par des armées

- Statut : accepté
- Date : 2026-11-01

## Contexte

Un raid se résumait à un nombre de trirèmes armées au départ et à une tactique, comparée à
la posture du défenseur. Grepolis fait autrement : le joueur forme des unités à la caserne
et au chantier naval, nourries par la ferme, puis les envoie au combat. Les navires se
battent d'abord en mer, puis les troupes à terre, et chaque camp perd des unités.

## Décision

**Le Village forme les unités.** La caserne forme quatre unités terrestres (épéiste,
frondeur, archer, hoplite) et le chantier naval trois navires (bateau de transport,
birème, navire léger). Chaque unité a un coût, une population, une durée de formation et
le niveau de bâtiment qu'elle demande ; la ferme fixe la population. Les valeurs reprennent
Grepolis et vivent dans `realm/domain/army.ts`.

- Une commande `RecruitUnits` enregistre `UnitsRecruited` avec l'heure de départ et la
  durée d'une unité : les unités sortent l'une après l'autre, sans tâche de fond, comme les
  chantiers (ADR 0018). Les commandes d'un même bâtiment se suivent, trois au plus.
- Les transferts entre le Village et la Flotte (`realm.withdraw` et `realm.deposit`)
  portent des ressources ou des unités. `UnitsWithdrawn` fait partir une armée,
  `UnitsReturned` ramène les survivants, `UnitsLost` retire les défenseurs tombés. Le
  retrait des pertes d'un défenseur n'est jamais refusé : il est borné à ce qui reste.

**La Flotte mène des armées.** Un raid part avec une armée prise dans la garnison : au
moins un navire, et assez de bateaux de transport pour les troupes. La traversée dure de 1 à
7 minutes selon la distance sur la carte entre le village et sa cible, village ou île pirate,
et le navire le plus lent en fixe le pas ; aucun village n'est placé sur une île pirate. La bataille (`fleet/domain/battle.ts`) suit Grepolis :

1. La bataille navale oppose l'attaque des navires à la défense des navires adverses. Le
   perdant perd tout ; une flotte d'attaque coulée emporte ses troupes. Le vainqueur perd
   `(perdant / vainqueur) ^ 1,5` de ses navires de combat.
2. La bataille terrestre répartit l'attaque entre dégâts contondants, tranchants et à
   distance ; chaque défenseur oppose sa défense contre chacun, pondérée par cette
   répartition. Les habitants ajoutent 10 de défense, et chaque niveau du rempart 8 %.
3. Les survivants pillent selon leur capacité de butin, et rentrent au port à l'heure de
   retour du raid, où le butin est déposé.

Le Village ne publie pas sa garnison : la Flotte la compte à partir des événements publiés
des unités, à l'heure d'arrivée du raid. Le domaine de la Flotte reçoit les valeurs des
unités de sa couche application (`ArmyRules`) et n'importe rien du Village. Les îles
pirates ont une garnison ; leur capitaine appelle une réserve de l'unité qui défend le
mieux contre les dégâts que le joueur lui inflige le plus souvent (ADR 0013).

Les raids de trirèmes déjà enregistrés se rejouent toujours avec leurs règles. Le tutoriel
apprend la ferme, la caserne, la formation des troupes et des navires, et l'Historique
raconte les recrutements et détaille les batailles d'armées.

## Conséquences

### Positives

- Le joueur prépare ses raids comme dans Grepolis : former, choisir, embarquer, combattre.
- Les pertes et la population donnent un coût durable à chaque bataille.
- La prévision du Conseil de guerre utilise la même fonction que la bataille réelle.

### Négatives

- La garnison d'un village se calcule en rejouant les mouvements de ses unités.
- Les événements de raid portent deux formes, trirèmes et armées, que les lecteurs doivent
  connaître.
- Sans route de triche, les tests de bout en bout ne peuvent pas armer un joueur : le
  combat est couvert par les tests du domaine et de l'API.

## Alternatives écartées

- **Garder les trirèmes armées au départ** : simple, mais sans formation ni pertes.
- **Un module Armée à part** : les unités vivent avec la population et les ressources du
  village, qui les forme et les paie ; un module de plus multiplierait les messages.
- **Publier la garnison dans un événement à chaque changement** : redondant avec les
  mouvements d'unités, déjà publiés.

## Usage de l'IA générative
